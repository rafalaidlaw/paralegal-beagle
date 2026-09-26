// Exercise the interactive paths a static render cannot reach: ticking a
// chapter, the per-course master tick, the theme toggle, week stepping by
// button and by key, the deadlines-only switch, and deep links.
//
// Updated 13 Sep 2026 for the sidebar layout: the week label lives in the
// stepper row, the term strip became the runway, the READ counter sits in the
// readings section head, and the Exams view became Deadlines (with #exams
// kept as an alias so old bookmarks still land).
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// This suite ticks real chapters through the real API, which writes
// data/progress.csv -- Rafael's own record. It once cycled a chapter he had
// ticked, and the file was then reset by hand as if it were test residue,
// losing a second tick. So: snapshot the file first, put it back on exit no
// matter how the run ends, and never assume the file starts empty.
const PROGRESS = "C:/Users/Rafael/Desktop/Paralegal-Beagle/data/progress.csv";
const progressBefore = readFileSync(PROGRESS, "utf8");
function restoreProgress() {
  try { writeFileSync(PROGRESS, progressBefore, "utf8"); } catch (e) { console.log("could not restore progress.csv: " + e.message); }
}
process.on("exit", restoreProgress);
process.on("SIGINT", () => { restoreProgress(); process.exit(130); });

const PORT = 9490;
const profile = mkdtempSync(join(tmpdir(), "int-"));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, "--hide-scrollbars", "--window-size=1440,1200", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 80 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; }
  catch { await sleep(250); }
}
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pend = new Map();
const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
    logs.push("console.error: " + m.params.args.map((a) => a.value ?? a.description).join(" "));
  if (m.method === "Runtime.exceptionThrown")
    logs.push("uncaught: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
};
const send = (me, p = {}, s) => { const x = { id: ++id, method: me, params: p }; if (s) x.sessionId = s; ws.send(JSON.stringify(x)); return new Promise((r) => pend.set(x.id, r)); };
const { result: { targetInfos } } = await send("Target.getTargets");
const { result: { sessionId: S } } = await send("Target.attachToTarget", { targetId: targetInfos.find((t) => t.type === "page").targetId, flatten: true });
await send("Page.enable", {}, S); await send("Runtime.enable", {}, S);
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false }, S);

const evalJs = async (expression) => {
  const { result } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, S);
  if (result.exceptionDetails) return { err: result.exceptionDetails.exception?.description || "threw" };
  return { v: result.result.value };
};
async function go(hash) {
  await send("Page.navigate", { url: `http://127.0.0.1:8787/#${hash}` }, S);
  await sleep(1800);
}
const click = async (sel) => (await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return "NO ELEMENT"; e.click(); return "clicked"; })()`)).v;
const key = async (k) => {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, text: k }, S);
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: k }, S);
};

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail !== undefined ? "  -> " + JSON.stringify(detail) : ""}`); }
}

// ---------------------------------------------------------------- reading tick
await go("week");
const firstChip = ".chch[data-reading]";
const rid = (await evalJs(`document.querySelector('${firstChip}').dataset.reading`)).v;
// Rafael may have ticked this chapter himself. Cycle it to blank so the
// three-state walk starts from a known place; the snapshot restores his real
// state when the run ends.
const stateOf = async () => (await evalJs(`document.querySelector('[data-reading="${rid}"]').dataset.s`)).v;
for (let guard = 0; guard < 3 && (await stateOf()) !== ""; guard++) { await click(`[data-reading="${rid}"]`); await sleep(700); }
check("chip cycled to blank as a starting point", (await stateOf()) === "", await stateOf());
const doneBefore = (await evalJs(`document.querySelectorAll('.chch[data-s="done"]').length`)).v;

await click(firstChip); await sleep(900);
check("chapter tick: blank -> in_progress", (await stateOf()) === "in_progress", await stateOf());

await click(`[data-reading="${rid}"]`); await sleep(900);
check("chapter tick: in_progress -> done", (await stateOf()) === "done", await stateOf());

let srv = await (await fetch("http://127.0.0.1:8787/api/data")).json();
check("progress persisted to the server", srv.progress.some((p) => p.reading_id === rid && p.status === "done"), srv.progress.filter((p) => p.reading_id === rid));

// the x-of-y counter in the readings section head must move by exactly one
let counter = await evalJs(`document.querySelector('.sechead .mono')?.textContent.replace(/\\s+/g,' ').trim()`);
check("the readings counter counts the tick", new RegExp(`^${doneBefore + 1} of \\d+ done$`).test(counter.v || ""), { counter: counter.v, doneBefore });

await click(`[data-reading="${rid}"]`); await sleep(900);   // back to blank
check("chapter tick: done -> blank", (await stateOf()) === "", await stateOf());
srv = await (await fetch("http://127.0.0.1:8787/api/data")).json();
check("clearing removes the row, no ghost", !srv.progress.some((p) => p.reading_id === rid && p.status), srv.progress.filter((p) => p.reading_id === rid));

// ---------------------------------------------------------------- scroll stays put
// A tick re-renders the view; it must not throw you back to the top.
await go("week");
const lastChip = (await evalJs(`(() => { const c = [...document.querySelectorAll('.chch[data-reading]')]; const e = c[c.length - 1]; e.scrollIntoView({ block: "center" }); return e.dataset.reading; })()`)).v;
await sleep(300);
const yBefore = (await evalJs(`window.scrollY`)).v;
await click(`[data-reading="${lastChip}"]`); await sleep(900);
const yAfter = (await evalJs(`window.scrollY`)).v;
check("ticking a chapter keeps the scroll position", yBefore > 200 && Math.abs(yAfter - yBefore) < 4, { yBefore, yAfter });
await click(`[data-reading="${lastChip}"]`); await sleep(600);
await click(`[data-reading="${lastChip}"]`); await sleep(600);   // back to blank
await evalJs(`document.querySelector('#nav a[data-view="deadlines"]').click()`); await sleep(1200);
check("switching screens goes to the top", (await evalJs(`window.scrollY`)).v === 0, (await evalJs(`window.scrollY`)).v);

// ---------------------------------------------------------------- master tick
// Every POST must settle before one re-render, or the last write can lose the
// race. Week 5 has a four-chapter meeting (LGL151 ch 2,3,5,10). Week 15 looks
// like a six-chapter meeting but has no readings: those numbers are the final
// exam's scope, which derive_readings excludes on purpose.
await go("week/5");
const master = (await evalJs(`(() => { const b = [...document.querySelectorAll('[data-master]')].sort((x,y)=>y.dataset.master.split(',').length-x.dataset.master.split(',').length)[0]; return b ? b.dataset.master : null; })()`)).v;
if (master) {
  const n = master.split(",").length;
  await click(`[data-master="${master}"]`); await sleep(400 + 500 * n);
  srv = await (await fetch("http://127.0.0.1:8787/api/data")).json();
  const doneAll = master.split(",").every((i) => srv.progress.some((p) => p.reading_id === i && p.status === "done"));
  check(`master tick marked all ${n} chapters`, doneAll, master.split(",").map((i) => [i, srv.progress.find((p) => p.reading_id === i)?.status]));
  const shown = await evalJs(`document.querySelectorAll('.chch[data-s="done"]').length`);
  check("master tick re-rendered once, chips show done", shown.v >= n, shown.v);
  await click(`[data-master="${master}"]`); await sleep(400 + 500 * n);   // clear
  srv = await (await fetch("http://127.0.0.1:8787/api/data")).json();
  check("master tick clears all again", master.split(",").every((i) => !srv.progress.some((p) => p.reading_id === i && p.status)), null);
} else check("found a multi-chapter master tick", false, "none in week 5");

// ---------------------------------------------------------------- week nav
await go("week");
const wkText = () => evalJs(`document.querySelector('.wknav b')?.textContent.trim()`);
// Read the week the app lands on rather than naming one. This suite was
// written in week 1 and asserted "Week 1 of 15"; by week 3 that had turned
// seven honest checks red for no reason but the calendar.
const wkNo = async () => Number(((await wkText()).v || "").match(/Week (\d+) of/)?.[1]);
const here = await wkNo();
check("lands on a real term week", here >= 1 && here <= 15, (await wkText()).v);
await click("#wk-next"); await sleep(1200);
check("next-week button steps forward", (await wkNo()) === here + 1, (await wkText()).v);
await key("]"); await sleep(1200);
check("] key steps forward", (await wkNo()) === here + 2, (await wkText()).v);
await key("["); await sleep(1200);
check("[ key steps back", (await wkNo()) === here + 1, (await wkText()).v);
check("the hash follows the week", (await evalJs("location.hash")).v === `#week/${here + 1}`, (await evalJs("location.hash")).v);
await click("#wk-today"); await sleep(1000);
check("back-to-this-week returns to the current week", (await wkNo()) === here, (await wkText()).v);
const stripNow = await evalJs(`document.querySelectorAll('.runway.now').length`);
check("exactly one runway row is marked now", stripNow.v === 1, stripNow.v);
const sideWeek = await evalJs(`document.querySelector('#wk-big')?.textContent.trim()`);
check("the sidebar shows the current week, zero-padded",
  sideWeek.v === String(here).padStart(2, "0"), { sideWeek: sideWeek.v, here });

// ---------------------------------------------------------- sidebar footer
// The footer counts the classes still ahead and carries a line that changes
// with the date -- same day, same line, so it is never noise.
await go("week");
const foot = await evalJs(`JSON.stringify({
  text: document.querySelector('#footstats')?.textContent.replace(/\s+/g, " ").trim(),
  pep: document.querySelector('#footstats .pep')?.textContent.trim(),
  n: Number(document.querySelector('#footstats b')?.textContent.trim())
})`);
const fj = JSON.parse(foot.v);
const srvLeft = await (await fetch("http://127.0.0.1:8787/api/data")).json();
const wantLeft = srvLeft.schedule.filter((r) => r.due_type !== "study_week" && r.class_date >= srvLeft.today).length;
check("the footer counts the classes still ahead", fj.n === wantLeft, { shown: fj.n, wantLeft });
check("the footer names the last day of term", /to \w{3} \d+ \w+/.test(fj.text || ""), fj.text);
check("the footer carries a line for the day", !!fj.pep && fj.pep.length < 40, fj.pep);
// it must be the same line on a re-render, not a fresh roll of the dice
await go("deadlines"); await go("week");
const pep2 = await evalJs(`document.querySelector('#footstats .pep')?.textContent.trim()`);
check("that line does not change on a re-render", pep2.v === fj.pep, { first: fj.pep, second: pep2.v });

// -------------------------------------------------- Upcoming rolls forward
// From Saturday, "this week" means the week ahead: its classes are done and
// what is worth reading for is next week's. Asserted as an invariant rather
// than against a fixed date, so the suite keeps working every day of the week.
await go("week");
const roll = await evalJs(`JSON.stringify({
  title: document.querySelector("#vtitle")?.textContent.trim(),
  label: document.querySelector("#wk-lbl")?.textContent.trim(),
  big: document.querySelector("#wk-big")?.textContent.trim(),
  range: document.querySelector("#wk-range")?.textContent.trim(),
  stepper: document.querySelector(".wknav b")?.textContent.trim(),
  dow: new Date().getDay()
})`);
const rj = JSON.parse(roll.v);
const weekend = rj.dow === 0 || rj.dow === 6;
check("the screen is called Upcoming", rj.title === "Upcoming", rj);
check(`the sidebar label matches the day (${weekend ? "weekend" : "weekday"})`,
  rj.label === (weekend ? "Week ahead" : "Current week"), rj);
check("a rolled-forward sidebar says when that week starts",
  weekend ? /^Starts Mon /.test(rj.range) : / — /.test(rj.range), rj);
check("the stepper opens on the same week the sidebar names",
  rj.stepper === `Week ${Number(rj.big)} of 15`, rj);
// A week-precision item whose Monday has gone counts down to the day its
// window shuts, never "this week" -- which would name the wrong week.
const cards = await evalJs(`[...document.querySelectorAll('.card .days')].map(e => e.textContent.replace(/\\s+/g, " ").trim())`);
check("no card says 'this week' once the week has rolled",
  !weekend || !(cards.v || []).some((c) => /this week/i.test(c)), cards.v);

// ---------------------------------------------------------------- theme
await go("week");
const themeState = () => evalJs(`JSON.stringify({attr: document.documentElement.dataset.theme || "", btn: document.querySelector("#theme").textContent.trim(), ls: localStorage.getItem("beagle-theme")})`);
// light is the default even on a dark system
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }, S);
await go("week");
let t = JSON.parse((await themeState()).v);
const bgStart = await evalJs(`getComputedStyle(document.body).backgroundColor`);
check("theme starts on light, even with a dark system", t.attr === "light" && bgStart.v === "rgb(243, 242, 242)", { ...t, bg: bgStart.v });
await click("#theme"); await sleep(250);
t = JSON.parse((await themeState()).v);
check("theme -> dark sets the attribute and persists", t.attr === "dark" && t.ls === "dark" && /Dark/.test(t.btn), t);
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, S);
await sleep(200);
const bgDark = await evalJs(`getComputedStyle(document.body).backgroundColor`);
check("explicit dark wins over a light system", bgDark.v === "rgb(22, 21, 20)", bgDark.v);
await click("#theme"); await sleep(250);
t = JSON.parse((await themeState()).v);
check("theme -> auto follows Windows", t.attr === "" && t.ls === "auto", t);
const bgAuto = await evalJs(`getComputedStyle(document.body).backgroundColor`);
check("auto follows the light system", bgAuto.v === "rgb(243, 242, 242)", bgAuto.v);
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }, S);
await sleep(200);
const bgAutoDark = await evalJs(`getComputedStyle(document.body).backgroundColor`);
check("auto follows a dark system too", bgAutoDark.v === "rgb(22, 21, 20)", bgAutoDark.v);
await click("#theme"); await sleep(250);
t = JSON.parse((await themeState()).v);
check("theme cycles back to light", t.attr === "light" && t.ls === "light", t);

// ---------------------------------------------------------------- deadlines only
await go("grid");
const chVisible = () => evalJs(`getComputedStyle(document.querySelector('.gcell .chips')).display`);
check("the Weekly Calendar shows chapters by default", (await chVisible()).v !== "none", (await chVisible()).v);
await click("#deadlines-only"); await sleep(900);
check("deadlines-only hides the chapter runs", (await chVisible()).v === "none", (await chVisible()).v);
check("deadlines-only persisted on its own key", (await evalJs(`localStorage.getItem("beagle-deadlines-only")`)).v === "1", null);
await go("grid");   // reload: must not flash the wide layout
check("deadlines-only survives a reload", (await chVisible()).v === "none", (await chVisible()).v);
await click("#deadlines-only"); await sleep(900);
check("toggling deadlines-only back shows chapters", (await chVisible()).v !== "none", (await chVisible()).v);
// the spacing toggle is gone (compact is the only spacing now); the sidebar
// footer holds the theme button alone
check("no density button in the sidebar", (await evalJs(`document.querySelector('#density')`)).v === null, null);

// ---------------------------------------------------------------- one tick, every view
// The Weekly Calendar carries the same chips as This Week and Courses, all reading
// one progress row, so a tick made in the grid must show on the other two.
// `rid` was cycled to blank at the top of this run.
await go("grid");
const gridState = async () => (await evalJs(`document.querySelector('.gcell [data-reading="${rid}"]')?.dataset.s`)).v;
check("the grid shows a tick chip for the first reading", (await gridState()) === "", await gridState());
await click(`.gcell [data-reading="${rid}"]`); await sleep(900);
check("ticking in the grid: blank -> in_progress", (await gridState()) === "in_progress", await gridState());
await go("week");
check("the same tick shows on This Week", (await stateOf()) === "in_progress", await stateOf());
await click(`[data-reading="${rid}"]`); await sleep(700);     // done, ticked on This Week this time
await go("grid");
check("a tick made on This Week shows in the grid", (await gridState()) === "done", await gridState());
await click(`.gcell [data-reading="${rid}"]`); await sleep(900);   // back to blank
check("the grid clears it again", (await gridState()) === "", await gridState());

// below 1338px the grid scrolls sideways; a tick re-renders it and must not
// throw the scroller back to the left edge
await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false }, S);
await go("grid");
const xSet = (await evalJs(`(() => { const g = document.querySelector('.gridwrap'); g.scrollLeft = 260; return g.scrollLeft; })()`)).v;
await click(`.gcell [data-reading="${rid}"]`); await sleep(900);
const xAfter = (await evalJs(`document.querySelector('.gridwrap').scrollLeft`)).v;
check("ticking in a scrolled grid keeps the sideways scroll", xSet === 260 && xAfter === 260, { xSet, xAfter });
await click(`.gcell [data-reading="${rid}"]`); await sleep(600);
await click(`.gcell [data-reading="${rid}"]`); await sleep(600);   // back to blank
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false }, S);

// ---------------------------------------------------------------- competencies
// The LSO competency numbers were switched off on 26 Sep 2026: a line on every
// class, and no syllabus gives the wording behind a number, so there was
// nothing there to act on. SHOW_LSO in app.js brings them back. Until then no
// screen may show one -- and the numbers must still be in the data, so that
// switch is all it takes.
for (const view of ["week/2", "grid"]) {
  await go(view);
  const n = await evalJs(`document.querySelectorAll('.lso').length`);
  check(`no competency lines on ${view}`, n.v === 0, n.v);
}
const lsoKept = await (await fetch("http://127.0.0.1:8787/api/data")).json();
const lsoRows = lsoKept.schedule.filter((r) => r.lso_nums).length;
check("the numbers are still in the data, ready to switch back on", lsoRows === 65, lsoRows);
const colOrder = await evalJs(`[...document.querySelectorAll('.grow.head .gcell .code')].map(e => e.textContent.trim())`);
check("the calendar's columns run in Rafael's week order",
  JSON.stringify(colOrder.v) === JSON.stringify(["LGL156", "LGL151", "LGL250", "LGL225", "LGL154", "LGL160", "LGL152", "LGL153"]), colOrder.v);
const legOrder = await evalJs(`[...document.querySelectorAll('.legend .code')].map(e => e.textContent.trim())`);
check("the legend beneath it reads in the same order",
  JSON.stringify(legOrder.v) === JSON.stringify(colOrder.v), legOrder.v);

// ---------------------------------------------------------------- deep links
// Cut to three screens on 24 Sep 2026. The other five still render (viewtest
// proves that) but are not listed and not routable, and nothing may link to
// them -- a link to nowhere is worse than no link.
const navViews = await evalJs(`[...document.querySelectorAll('#nav a[data-view]')].map(a => a.dataset.view)`);
check("the sidebar lists exactly the shown screens, in order",
  JSON.stringify(navViews.v) === JSON.stringify(["grid", "week", "deadlines", "timetable"]), navViews.v);
const navCount = await evalJs(`document.querySelector('#nav a[data-view="deadlines"] .count')?.textContent.trim()`);
check("the sidebar shows a count beside a screen", /^\d+$/.test(navCount.v || ""), navCount.v);
const navOn = await evalJs(`document.querySelectorAll('#nav a.on').length`);
check("exactly one nav item is active", navOn.v === 1, navOn.v);

await go("courses/LGL225");   // an old bookmark to a screen that is now hidden
const landed = await evalJs(`JSON.stringify({ title: document.querySelector("#vtitle")?.textContent.trim(), csel: !!document.querySelector("#csel") })`);
const lj = JSON.parse(landed.v);
check("an old deep link to a hidden screen lands on Upcoming", lj.title === "Upcoming" && !lj.csel, lj);
await go("week");
const deadPills = await evalJs(`JSON.stringify({ links: document.querySelectorAll('.card a.course-pill').length, chips: document.querySelectorAll('.card .course-pill').length })`);
const dp = JSON.parse(deadPills.v);
check("course pills are chips, not links to a hidden screen", dp.links === 0 && dp.chips > 0, dp);
await go("grid");
const legendLinks = await evalJs(`JSON.stringify({ links: document.querySelectorAll('.legend a').length, items: document.querySelectorAll('.legend .leg').length })`);
const ll = JSON.parse(legendLinks.v);
check("the grid legend is likewise not linked", ll.links === 0 && ll.items === 8, ll);

// ---------------------------------------------------------------- deadlines
await go("exams");   // the old hash must still land somewhere sensible
const title = await evalJs(`document.querySelector("#vtitle")?.textContent.trim()`);
check("#exams aliases to Deadlines", title.v === "Deadlines", title.v);
// The Term Grid became the Weekly Calendar on 24 Sep 2026. #grid stays the
// route so old bookmarks work; #calendar matches the name on screen.
for (const [hash, want] of [["grid", "Weekly Calendar"], ["calendar", "Weekly Calendar"]]) {
  await go(hash);
  const t = await evalJs(`document.querySelector("#vtitle")?.textContent.trim()`);
  check(`#${hash} opens the Weekly Calendar`, t.v === want, t.v);
}
const calSub = await evalJs(`document.querySelector("#vsub")?.textContent.trim()`);
check("the Weekly Calendar carries no subtitle", calSub.v === "", JSON.stringify(calSub.v));
const navText = await evalJs(`[...document.querySelectorAll('#nav a[data-view]')].map(a => a.firstChild.textContent.trim())`);
check("the sidebar names its screens and shows no group headings",
  JSON.stringify(navText.v) === JSON.stringify(["Weekly Calendar", "Upcoming", "Deadlines", "Timetable"])
  && (await evalJs(`document.querySelectorAll('#nav .grp').length`)).v === 0, navText.v);

// ---------------------------------------------------------------- timetable
// Rafael's week from his class listing, drawn to scale out of
// data/timetable.csv: every block has a start, a finish, a room and the class
// number he is enrolled in. The open-ended drawing is kept for the case where
// a row arrives without an end -- it must never be given an invented one.
await go("timetable");
const ttShape = await evalJs(`JSON.stringify({
  days: [...document.querySelectorAll('.tthead .ttday')].map(e => e.textContent.trim()),
  blocks: document.querySelectorAll('.ttblock').length,
  open: document.querySelectorAll('.ttblock.open').length,
  rooms: [...document.querySelectorAll('.ttblock .where')].length,
  clear: document.querySelector('.stats .stat:nth-child(3) .v')?.textContent.trim(),
  rows: document.querySelectorAll('.rtable tbody tr').length
})`);
const ts = JSON.parse(ttShape.v);
// Monday has no class this term, so it is not drawn at all -- but it is still
// named in the stats, because a clear day is worth knowing about.
check("the timetable draws only the days with a class in them",
  JSON.stringify(ts.days) === JSON.stringify(["Tue", "Wed", "Thu", "Fri"]), ts.days);
check("every row in timetable.csv is drawn and listed", ts.blocks === 11 && ts.rows === 11, ts);
check("no block is open-ended now that every finish is known", ts.open === 0, ts);
check("every block says where it is, room or online", ts.rooms === 11, ts);
check("Monday is left out of the chart but still named as clear", ts.clear === "Mon", ts);
const ttCols = await evalJs(`getComputedStyle(document.querySelector('.tt')).getPropertyValue('--cols').trim()`);
check("the chart is as wide as the days it draws", ttCols.v === "4", ttCols.v);
// A block must sit where the clock says. LGL225 runs 8:55-10:40 in a chart that
// starts at 8:00 and ends at 19:00 -- 55 minutes down a 660-minute span.
const ttPos = await evalJs(`(() => {
  const b = document.querySelector('.ttblock[data-c="LGL225"]');
  return b ? { top: b.style.top, height: b.style.height } : null;
})()`);
const wantTop = (55 / 660 * 100).toFixed(3) + "%", wantH = (105 / 660 * 100).toFixed(3) + "%";
check("a block is placed by the clock, not by its order",
  ttPos.v && ttPos.v.top === wantTop && ttPos.v.height === wantH, { got: ttPos.v, wantTop, wantH });
const ttWarn = await evalJs(`document.querySelector('.callout .lbl.red')?.textContent.trim()`);
check("the section conflict is called out on the page",
  /different day/.test(ttWarn.v || ""), ttWarn.v);
// The enrolment listing is the authority for the three courses whose syllabus
// describes another section. If these ever drift, the chart is lying.
const ttTimes = await evalJs(`JSON.stringify([...document.querySelectorAll('.ttblock')].map(b =>
  b.dataset.c + " " + b.closest('.ttcol').previousElementSibling ))`);
const ttEnrol = await evalJs(`JSON.stringify([...document.querySelectorAll('.rtable tbody tr')].map(r =>
  [...r.children].slice(0, 3).map(c => c.textContent.trim().replace(/\\s+/g, " ")).join(" | ")))`);
const rows = JSON.parse(ttEnrol.v);
for (const want of ["LGL151 | Tue | 1:30pm – 4:10pm", "LGL152 | Fri | 9:50am – 11:35am",
                    "LGL156 | Tue | 11:40am – 1:25pm", "LGL156 | Thu | 1:30pm – 2:20pm",
                    "LGL153 | Fri | 1:30pm – 3:15pm", "LGL152 | Thu | 11:40am – 1:25pm"]) {
  check(`the listing's own hours survive: ${want}`, rows.some((r) => r.startsWith(want)), rows);
}
const ttHours = await evalJs(`document.querySelector('.stats .stat:nth-child(4) .v')?.textContent.trim()`);
check("the weekly total can be stated now", ttHours.v === "19.3", ttHours.v);


// ------------------------------------------------------- "# 1" -> "#1"
// LGL154's syllabus prints "Assignment # 1" and the CSV keeps that, because
// every figure has to trace back to a page of the PDF. The gap is closed on
// the way to the screen, so no view may show one.
for (const view of ["week/3", "week/5", "deadlines", "grid"]) {
  await go(view);
  const gaps = await evalJs(`(() => {
    const raw = [...document.querySelectorAll('.raw, details')];
    const txt = [...document.querySelectorAll('h3, .name, .tag, .ch, .topic, td, li')]
      .filter(e => !raw.some(r => r.contains(e)))
      .map(e => e.textContent).join(" | ");
    return (txt.match(/#\s+\d/g) || []).length;
  })()`);
  check(`no gap after a # on ${view}`, gaps.v === 0, gaps.v);
}
const tidied = await evalJs(`[...document.querySelectorAll('.gcell .tag')].map(e => e.textContent.trim()).filter(t => /#/.test(t))`);
check("the calendar shows Assignment #1, not Assignment # 1",
  (tidied.v || []).some((t) => /^Assignment #1 /.test(t)) && !(tidied.v || []).some((t) => /#\s/.test(t)), tidied.v);

await go("deadlines");   // back, for the two checks below
const nextRows = await evalJs(`document.querySelectorAll('.drow.next').length`);
check("exactly one deadline row is marked next", nextRows.v === 1, nextRows.v);
const months = await evalJs(`[...document.querySelectorAll('.month')].map(m => m.textContent.trim())`);
check("deadlines are grouped by month", Array.isArray(months.v) && months.v.length >= 3, months.v);

console.log(`\n${pass} passed, ${fail} failed`);
if (logs.length) { console.log("\nbrowser errors:"); logs.forEach((l) => console.log("  " + l)); }
ws.close(); chrome.kill();
process.exit(fail || logs.length ? 1 : 0);
