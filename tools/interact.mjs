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
await evalJs(`document.querySelector('#nav a[data-view="timetable"]').click()`); await sleep(1200);
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
  text: document.querySelector('#footstats')?.textContent.replace(/\\s+/g, " ").trim(),
  pep: document.querySelector('#footstats .pep')?.textContent.trim(),
  n: Number(document.querySelector('#footstats b')?.textContent.trim())
})`);
const fj = JSON.parse(foot.v);
const srvLeft = await (await fetch("http://127.0.0.1:8787/api/data")).json();
const wantLeft = srvLeft.schedule.filter((r) => r.due_type !== "study_week" && r.class_date >= srvLeft.today).length;
check("the footer counts the classes still ahead", fj.n === wantLeft, { shown: fj.n, wantLeft });
check("the footer reads 'classes to go'", /classes to go/i.test(fj.text || ""), fj.text);
check("the footer carries a line for the day", !!fj.pep && fj.pep.length < 40, fj.pep);
// it must be the same line on a re-render, not a fresh roll of the dice
await go("grid"); await go("week");
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

// A week-precision window runs Monday to Sunday, so due_resolved must BE a
// Monday. Eleven rows print their course's own class day in due_week_of
// (LGL152 Thursdays, LGL156 and LGL160 Wednesdays); resolve_due() normalises
// them. Before 26 Sep 2026 it did not, and adding six days ran those windows
// up to four days into the next week -- LGL160's quiz, sat on the Wednesday,
// still read "3 days left" on the Saturday. Date-independent on purpose.
const payload = await (await fetch("http://127.0.0.1:8787/api/data")).json();
const weekly = payload.assessments.filter((a) => a.date_precision === "week" && a.due_resolved);
const strays = weekly.filter((a) => new Date(a.due_resolved + "T00:00:00").getDay() !== 1)
  .map((a) => a.id + " " + a.due_resolved);
check("every week-precision item resolves to a Monday", weekly.length > 0 && strays.length === 0, strays);
// and the week number must not have moved when it was normalised
const offWeek = payload.assessments.filter((a) => a.due_resolved &&
  a.week_no !== Math.floor((Date.parse(a.due_resolved + "T00:00:00") -
    Date.parse(payload.term.week1_monday + "T00:00:00")) / 604800000) + 1).map((a) => a.id);
check("normalising the window left every week number where it was", offWeek.length === 0, offWeek);

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
check("two themes only -- it goes straight back to light, never through auto",
  t.attr === "light" && t.ls === "light" && /Light/.test(t.btn), t);
// The system setting must not get a vote any more. Rafael asked for light and
// dark and nothing else (27 Sep 2026), so the attribute is always stamped and
// the prefers-color-scheme rule can never win.
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }, S);
await sleep(250);
const bgHeld = await evalJs(`getComputedStyle(document.body).backgroundColor`);
check("a dark system cannot override the chosen light", bgHeld.v === "rgb(243, 242, 242)", bgHeld.v);
// And the declaration stays "light dark" WHICHEVER is showing: it states what
// the page supports, and narrowing it to one value is read by Chrome on
// Android as "no dark mode here, I will darken it for you".
const decl = await evalJs(`getComputedStyle(document.documentElement).colorScheme`);
check("the page always tells the browser it supports both", decl.v === "light dark", decl.v);
await click("#theme"); await sleep(250);
const declDark = await evalJs(`JSON.stringify({ s: getComputedStyle(document.documentElement).colorScheme,
  bg: getComputedStyle(document.body).backgroundColor })`);
const dd = JSON.parse(declDark.v);
check("still both when it is showing dark", dd.s === "light dark" && dd.bg === "rgb(22, 21, 20)", dd);
await click("#theme"); await sleep(250);

// ----------------------------------------------- a finished tick recedes
// Lightened 26 Sep 2026. Two things must both hold: a done tick stays filled
// (fill against empty is how it reads at a glance), and it is clearly lighter
// than the body ink. Tested by cloning a chip, so no progress row is touched.
await go("grid");
const lum = (c) => { const [r, g, b] = c.match(/[0-9]+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const tick = await evalJs(`(() => {
  const c = document.querySelector('.chch');
  if (!c) return null;
  const probe = c.cloneNode(true);
  probe.dataset.s = "done";
  c.parentNode.appendChild(probe);
  const v = { done: getComputedStyle(probe.querySelector('.box')).backgroundColor,
              ink: getComputedStyle(document.body).color };
  probe.remove();
  return JSON.stringify(v);
})()`);
const tk = tick.v ? JSON.parse(tick.v) : null;
check("a finished chapter's tick is still filled, not left empty",
  !!tk && !/, 0\)$/.test(tk.done), tk);
check("a finished chapter's tick is lighter than the body ink",
  !!tk && lum(tk.done) > lum(tk.ink) + 40, tk && { ...tk, doneLum: lum(tk.done), inkLum: lum(tk.ink) });

// ------------------------------------------------------- deadlines only, off
// Switched off 26 Sep 2026: the chapter runs are what the Weekly Calendar is
// for. The second check is the one worth having -- a "1" left in localStorage
// from before the change must not still hide them.
await go("grid");
const chVisible = () => evalJs(`getComputedStyle(document.querySelector('.gcell .chips')).display`);
check("the Weekly Calendar shows its chapter runs", (await chVisible()).v !== "none", (await chVisible()).v);
check("the deadlines-only button is gone",
  (await evalJs(`document.querySelector('#deadlines-only')`)).v === null, null);
await evalJs(`localStorage.setItem("beagle-deadlines-only", "1")`);
await go("grid"); await sleep(400);
check("a deadlines-only setting left over from before cannot hide the chapters",
  (await chVisible()).v !== "none", (await chVisible()).v);
await evalJs(`localStorage.removeItem("beagle-deadlines-only")`);
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
// A course title is ordinary prose until a single word is wider than the
// column -- "Communication", "Administrative" -- and a word that cannot break
// does not wrap, it runs into the next course's column. 22px was tried on
// 26 Sep 2026 and did exactly that, printing LGL160's "Communication" over
// LGL152's "Paralegals". The row is back at 12.5px, but the ceiling is a fact
// about eight columns across 1100px rather than about whatever size happens to
// be set, so the check stays.
const wide = await evalJs(`JSON.stringify([...document.querySelectorAll('.grow.head .gcell')]
  .map(e => { const t = e.querySelector('.short'), s = getComputedStyle(e);
    const inner = e.getBoundingClientRect().width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
    return { code: e.querySelector('.code').textContent.trim(),
             over: Math.round(t.scrollWidth - inner) }; })
  .filter(x => x.over > 0))`);
check("no course title runs into the next column", JSON.parse(wide.v).length === 0, wide.v);

// The name is the heading and the code is the subtitle beneath it (26 Sep
// 2026), so the name must come first in the DOM and carry the darker ink.
const headOrder = await evalJs(`(() => {
  const g = document.querySelector('.grow.head .gcell');
  const kids = [...g.children].map(e => e.className);
  const name = g.querySelector('.short'), code = g.querySelector('.code');
  return JSON.stringify({ first: kids[0], weight: getComputedStyle(name).fontWeight,
    nameInk: getComputedStyle(name).color, codeInk: getComputedStyle(code).color });
})()`);
const ho = JSON.parse(headOrder.v);
check("a column leads with the course name, not the code", ho.first === "short", ho);
check("the name carries the weight and the darker ink",
  Number(ho.weight) >= 700 && ho.nameInk !== ho.codeInk, ho);

// Course colour and its key came off the calendar on 26 Sep 2026: eight hues
// over eight columns explained nothing the heading did not already say.
const plainCal = await evalJs(`JSON.stringify({
  legends: document.querySelectorAll('.legend').length,
  tinted: document.querySelectorAll('.grow.head .gcell[data-c]').length,
  rule: getComputedStyle(document.querySelector('.grow.head .gcell')).borderTopWidth,
  links: document.querySelectorAll('.grow.head .gcell a').length
})`);
const pc = JSON.parse(plainCal.v);
check("the calendar carries no key", pc.legends === 0, pc);
check("no column wears a course colour", pc.tinted === 0 && pc.rule === "0px", pc);
check("a column heading is not a link to a hidden screen", pc.links === 0, pc);

// ---------------------------------------------------------------- timetable
// Rafael's week from his class listing, drawn to scale out of
// data/timetable.csv: every block has a start, a finish, a room and the class
// number he is enrolled in. Since 26 Sep 2026 the chart stands alone -- the
// table beneath it repeated what the chart already said, and the standing
// callout said the same thing on every visit.
await go("timetable");
const ttShape = await evalJs(`JSON.stringify({
  days: [...document.querySelectorAll('.tthead .ttday')].map(e => e.textContent.trim()),
  blocks: document.querySelectorAll('.ttblock').length,
  open: document.querySelectorAll('.ttblock.open').length,
  rooms: document.querySelectorAll('.ttblock .where').length,
  stats: document.querySelectorAll('.stats').length,
  sub: document.querySelector('#vsub')?.textContent.trim(),
  tables: document.querySelectorAll('.rtable').length,
  callouts: document.querySelectorAll('.callout').length
})`);
const ts = JSON.parse(ttShape.v);
// Monday has no class this term, so it is not drawn at all. Derived from the
// data, not hardcoded to Tue-Fri, so the column returns by itself the day a
// Monday class appears.
check("the timetable draws only the days with a class in them",
  JSON.stringify(ts.days) === JSON.stringify(["Tue", "Wed", "Thu", "Fri"]), ts.days);
check("every row in timetable.csv is drawn", ts.blocks === 11, ts);
check("no block is open-ended now that every finish is known", ts.open === 0, ts);
check("every block says where it is, room or online", ts.rooms === 11, ts);
// Everything around the chart came off on 26 Sep 2026: the table and callout
// beneath it, then the stats strip and the subtitle above it. The chart IS the
// screen, and it was being pushed under the fold by figures you could count
// off it yourself.
check("the chart stands alone -- no stats, no table, no callout",
  ts.stats === 0 && ts.tables === 0 && ts.callouts === 0, ts);
check("the timetable carries no subtitle while every row is confident",
  ts.sub === "", JSON.stringify(ts.sub));
const ttCols = await evalJs(`getComputedStyle(document.querySelector('.tt')).getPropertyValue('--cols').trim()`);
check("the chart is as wide as the days it draws", ttCols.v === "4", ttCols.v);
// A block must sit where the clock says. LGL225 runs 8:55-10:40 in a chart
// that starts at 8:00 and ends at 19:00 -- 55 minutes down a 660-minute span.
const ttPos = await evalJs(`(() => {
  const b = document.querySelector('.ttblock[data-c="LGL225"]');
  return b ? { top: b.style.top, height: b.style.height } : null;
})()`);
const wantTop = (55 / 660 * 100).toFixed(3) + "%", wantH = (105 / 660 * 100).toFixed(3) + "%";
check("a block is placed by the clock, not by its order",
  ttPos.v && ttPos.v.top === wantTop && ttPos.v.height === wantH, { got: ttPos.v, wantTop, wantH });
// the listing's own hours, read off the chart itself
const ttTitles = await evalJs(`JSON.stringify([...document.querySelectorAll('.ttblock')].map(b => b.getAttribute('title')))`);
const titles = JSON.parse(ttTitles.v);
for (const want of ["starts 1:30pm, ends 4:10pm", "starts 9:50am, ends 11:35am",
                    "starts 11:40am, ends 1:25pm", "starts 1:30pm, ends 2:20pm"]) {
  check(`the listing's own hours survive: ${want}`, titles.some((t) => (t || "").includes(want)), titles);
}
// The section conflict is no longer printed on screen (Rafael, 26 Sep 2026),
// but it must not be lost: every affected row still carries it in the data.
const ttData = await (await fetch("http://127.0.0.1:8787/api/data")).json();
const flagged = ttData.timetable.filter((t) => /different section|MONDAY/.test(t.note || "")).length;
check("the section conflict is still recorded in the data", flagged >= 4, flagged);

// ---------------------------------------------------------------- deep links
// Cut to three screens on 24 Sep 2026. The other five still render (viewtest
// proves that) but are not listed and not routable, and nothing may link to
// them -- a link to nowhere is worse than no link.
const navViews = await evalJs(`[...document.querySelectorAll('#nav a[data-view]')].map(a => a.dataset.view)`);
check("the sidebar lists exactly the shown screens, in order",
  JSON.stringify(navViews.v) === JSON.stringify(["grid", "week", "timetable"]), navViews.v);
const navCount = await evalJs(`document.querySelector('#nav a[data-view="week"] .count')?.textContent.trim()`);
check("the sidebar shows a count beside a screen", /^\d+$/.test(navCount.v || ""), navCount.v);
const navOn = await evalJs(`document.querySelectorAll('#nav a.on').length`);
check("exactly one nav item is active", navOn.v === 1, navOn.v);

await go("courses/LGL225");   // an old bookmark to a screen that is now hidden
// No hash at all: the app opens on SHOWN[0], which is the Weekly Calendar
// (Rafael, 26 Sep 2026 -- it opened on Upcoming until then). Asserted against
// the sidebar's own first entry rather than the word "Weekly Calendar", so
// reordering SHOWN moves both together or this fails.
await send("Page.navigate", { url: "http://127.0.0.1:8787/" }, S);
await sleep(1800);
const opened = await evalJs(`JSON.stringify({
  first: SHOWN[0],
  topOfNav: document.querySelector('#nav a')?.dataset.view,
  showing: state.view
})`);
const op = JSON.parse(opened.v);
check("with no hash the app opens on the first screen in the sidebar",
  op.showing === op.first && op.topOfNav === op.first, op);

const landed = await evalJs(`JSON.stringify({ title: document.querySelector("#vtitle")?.textContent.trim(), csel: !!document.querySelector("#csel") })`);
const lj = JSON.parse(landed.v);
check("an old deep link to a hidden screen lands on the opening screen",
  lj.title === "Weekly Calendar" && !lj.csel, lj);
await go("week");
const deadPills = await evalJs(`JSON.stringify({ links: document.querySelectorAll('.card a.course-pill').length, chips: document.querySelectorAll('.card .course-pill').length })`);
const dp = JSON.parse(deadPills.v);
check("course pills are chips, not links to a hidden screen", dp.links === 0 && dp.chips > 0, dp);
await go("timetable");   // the one screen that still shows a legend
const legendLinks = await evalJs(`JSON.stringify({ links: document.querySelectorAll('.legend a').length, items: document.querySelectorAll('.legend .leg').length })`);
const ll = JSON.parse(legendLinks.v);
check("the timetable legend is likewise not linked", ll.links === 0 && ll.items === 8, ll);

// ------------------------------------------------------------- the calendar
// The Term Grid became the Weekly Calendar on 24 Sep 2026. #grid stays the
// route so old bookmarks work; #calendar matches the name on screen.
for (const [hash, want] of [["grid", "Weekly Calendar"], ["calendar", "Weekly Calendar"]]) {
  await go(hash);
  const t = await evalJs(`document.querySelector("#vtitle")?.textContent.trim()`);
  check(`#${hash} opens the Weekly Calendar`, t.v === want, t.v);
}
const calSub = await evalJs(`document.querySelector("#vsub")?.textContent.trim()`);
check("the Weekly Calendar carries no subtitle", calSub.v === "", JSON.stringify(calSub.v));

// ------------------------------------------------------- Deadlines is off
// Switched off 26 Sep 2026: Upcoming carries the fortnight and the Weekly
// Calendar carries the whole term, so it was a third list of the same items.
// Its old hashes must still land somewhere, and nothing may link to it.
for (const hash of ["deadlines", "exams"]) {
  await go(hash);
  const t = await evalJs(`document.querySelector("#vtitle")?.textContent.trim()`);
  check(`#${hash} still lands somewhere sensible`, t.v === "Weekly Calendar", t.v);
}
await go("week");
// "Already happened" came off Upcoming on 26 Sep 2026 -- it is a screen about
// what is next, and a sat exam is not something to act on.
const gone = await evalJs(`document.body.textContent.includes("Already happened")`);
check("Upcoming does not list what has already happened", gone.v === false, gone.v);
const dlLinks = await evalJs(`document.querySelectorAll('a[href="#deadlines"], a[href^="#deadlines/"]').length`);
check("nothing on Upcoming links to the hidden Deadlines screen", dlLinks.v === 0, dlLinks.v);
const upRows = await evalJs(`JSON.stringify({
  links: document.querySelectorAll('#view a[href^="#deadlines"], #view a[href^="#courses"]').length,
  codes: [...document.querySelectorAll('.card:not(.quiet-week) .who .course-pill')].map(e => e.textContent.trim()),
  names: [...document.querySelectorAll('.card:not(.quiet-week) .course')].map(e => e.textContent.trim()),
  shown: document.querySelectorAll('.card:not(.quiet-week) .name').length,
  quiet: document.querySelectorAll('.card.quiet-week').length,
  bands: document.querySelectorAll('.weekband, .upnext').length
})`);
const ur = JSON.parse(upRows.v);
check("nothing on Upcoming links to a screen that is not shown", ur.links === 0, ur);
// Every item of the week is a card now -- no list beneath, and no dashed band
// about week-precision dates (both went 26 Sep 2026).
check("the week's items are all cards, with no list or band beneath",
  ur.bands === 0, ur);
check("each card names its course by code and in full",
  ur.codes.length === ur.shown && ur.codes.every((c) => /^LGL\d{3}$/.test(c))
  && ur.names.length === ur.shown && ur.names.every((n) => n.length > 6), ur);

// Upcoming's horizon is the week it names -- the five business days of it --
// not a rolling 7 or 14 days from today (Rafael, 26 Sep 2026). So what is on
// screen must be EXACTLY that week's still-standing items, with nothing
// summarised into a count: a count is where a 30% test hid once before.
// Date-independent: it derives what it expects from the same payload the page
// renders, so it keeps meaning something in November.
const pay2 = await (await fetch("http://127.0.0.1:8787/api/data")).json();
const plusDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00") + n * 86400000).toISOString().slice(0, 10);
const wkShown = Number(rj.big);
const want = pay2.assessments.filter((a) => a.due_resolved && a.week_no === wkShown &&
  (a.date_precision === "exact" ? a.due_resolved : plusDays(a.due_resolved, 6)) >= pay2.today);
check(`Upcoming shows every item of week ${wkShown}, and none from another week`,
  want.length ? ur.shown === want.length : ur.quiet === 1,
  { shown: ur.shown, quiet: ur.quiet, want: want.map((a) => a.course + " " + a.name) });

// An item whose date is genuinely not known yet -- LGL151's case presentation,
// where the slot changes from student to student and is posted to Blackboard --
// is held off both screens by date_precision "unknown". It keeps its weight,
// and validate.py names it on every run, so it cannot vanish quietly. Derived
// from the payload rather than hardcoded, so the day Rafael gets his slot and
// it is dated, this simply stops applying.
const undated = pay2.assessments.filter((a) => a.date_precision === "unknown");
check("an item with no settled date resolves to no date and no week",
  undated.every((a) => !a.due_resolved && !a.week_no), undated.map((a) => a.id));
check("an undated item still carries its weight toward the course's 100",
  undated.every((a) => a.weight_pct !== ""), undated.map((a) => a.id + " " + a.weight_pct));
for (const u of undated) {
  const onWeek = await evalJs(`document.body.textContent.includes(${JSON.stringify(u.name)})`);
  check(`${u.id} is not on Upcoming`, onWeek.v === false, u.name);
}
if (undated.length) {
  await go("grid");
  for (const u of undated) {
    const onCal = await evalJs(`document.body.textContent.includes(${JSON.stringify(u.name)})`);
    check(`${u.id} is not on the Weekly Calendar either`, onCal.v === false, u.name);
  }
  await go("week");
}

// ------------------------------------------------------------------ phone
// Everything above runs at 1440. Two things only exist below 900px, and both
// were reported from a phone on 26 Sep 2026.
await send("Emulation.setDeviceMetricsOverride",
  { width: 412, height: 915, deviceScaleFactor: 2, mobile: true }, S);
await go("grid");

// 1. The colour scheme. Choosing Light used to leave "some elements" dark:
// everything the STYLESHEET cannot reach -- native controls, the scrollbar,
// the caret, the address bar, and Chrome on Android force-darkening the page.
// color-scheme is what tells the browser, and it has to track the theme.
const scheme = await evalJs(`JSON.stringify({
  decl: getComputedStyle(document.documentElement).colorScheme,
  meta: document.querySelector('meta[name="theme-color"]')?.content,
  bg: getComputedStyle(document.body).backgroundColor
})`);
const sc = JSON.parse(scheme.v);
check("the page says it supports both schemes", sc.decl === "light dark", sc);
check("the address bar is sent the page's own background", sc.meta === sc.bg, sc);
await evalJs(`document.documentElement.dataset.theme = "dark"; paintChrome(); "ok"`);
await sleep(300);
const dk = JSON.parse((await evalJs(`JSON.stringify({
  meta: document.querySelector('meta[name="theme-color"]')?.content,
  bg: getComputedStyle(document.body).backgroundColor })`)).v);
check("with the address bar following into dark", dk.meta === dk.bg, dk);
/* Put it back by hand. go() only changes the fragment, so navigating to the
   same #grid does NOT reload -- the attribute set above would have leaked into
   every check after this one, and did. */
await evalJs(`document.documentElement.dataset.theme = "light"; paintChrome(); "ok"`);
await sleep(200);

// 1b. The tab bar, and the one document that may scroll.
const bar = await evalJs(`JSON.stringify({
  labels: [...document.querySelectorAll('#nav a .lab')].map(e => e.textContent.trim()),
  counts: [...document.querySelectorAll('#nav .count')].map(e => getComputedStyle(e).display),
  justify: getComputedStyle(document.querySelector('#nav a')).justifyContent,
  tap: Math.round(document.querySelector('#theme').getBoundingClientRect().height),
  docScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  chain: getComputedStyle(document.querySelector('#main')).overscrollBehaviorY
})`);
const bb = JSON.parse(bar.v);
check("a phone tab says Calendar, not Weekly Calendar", bb.labels[0] === "Calendar", bb.labels);
check("the tab bar carries no counts", bb.counts.every((d) => d === "none"), bb.counts);
check("and its labels are centred", bb.justify === "center", bb.justify);
check("the theme button clears the 44px touch floor", bb.tap >= 44, bb.tap);
// Scrolling back up from the bottom was unresponsive because the gesture was
// handed to a document that had a few pixels of its own to give.
check("the document itself cannot scroll behind the app", bb.docScroll <= 0, bb.docScroll);
check("and the list does not hand its overscroll to it", /contain/.test(bb.chain), bb.chain);

// The theme button must DO something on every tap. "Auto" renders identically
// to whatever the phone is already set to, so on a dark phone one tap in three
// changed nothing at all and the button read as broken.
const ring = [];
for (let i = 0; i < 4; i++) {
  ring.push((await evalJs(`JSON.stringify({
    t: localStorage.getItem("beagle-theme"),
    bg: getComputedStyle(document.body).backgroundColor })`)).v);
  await evalJs(`document.querySelector('#theme').click(); "ok"`);
  await sleep(400);
}
const seen = ring.map((x) => JSON.parse(x));
check("every tap of the theme button changes the page",
  seen.every((x, i) => i === 0 || x.bg !== seen[i - 1].bg), seen);
check("a phone cycles light and dark only, never through auto",
  !seen.some((x) => x.t === "auto"), seen.map((x) => x.t));
await go("grid");

// 2. The calendar. On a phone it is not the desktop grid made narrower -- it
// is one week as a list (gridPhone in app.js), because eight columns across
// 412px is the wrong artefact rather than a layout problem. Rafael's mobile
// design, 27 Sep 2026.
await go("grid");
const phoneCal = await evalJs(`JSON.stringify({
  grid: document.querySelectorAll('.gridwrap').length,
  rows: document.querySelectorAll('.calrow').length,
  strip: document.querySelectorAll('.calcell').length,
  weeks: LAST_WEEK(),
  chips: document.querySelectorAll('.calrow .chch').length
})`);
const cal = JSON.parse(phoneCal.v);
check("the phone calendar is a list, not the eight-column grid",
  cal.grid === 0 && cal.rows > 0, cal);
check("the week strip carries the whole term", cal.strip === cal.weeks, cal);
check("the same tick chips are in it", cal.chips > 0, cal);

/* The strip does not rank the weeks by how heavy they are (Rafael, 28 Sep
   2026). Asserted two ways, because the tint could come back as either an
   inline background or a rule: no cell carries a style attribute, and every
   cell that is not a study week paints the same background. .now and .on are
   left alone -- they say where you are, not how bad it is. */
const heat = await evalJs(`JSON.stringify((() => {
  const cells = [...document.querySelectorAll('.calcell')];
  const plain = cells.filter(c => !c.classList.contains('brk'));
  return {
    styled: cells.filter(c => c.getAttribute('style')).length,
    backgrounds: [...new Set(plain.map(c => getComputedStyle(c).backgroundColor))],
    cells: cells.length
  };
})())`);
const ht = JSON.parse(heat.v);
check("the week strip does not tint the weeks by difficulty",
  ht.styled === 0 && ht.backgrounds.length === 1, ht);
// The mock names each course the way Rafael does. A 412px row spent two lines
// on "Introduction to the Legal System for Paralegals", most of it on the word
// "Paralegals", on a screen where every course is a paralegal course.
const names = await evalJs(`JSON.stringify({
  phone: [...document.querySelectorAll('.calrow .who b')].map(e => e.textContent.trim()),
  full: D.courses.map(c => c.name)
})`);
const nm2 = JSON.parse(names.v);
/* Not "differs from the full name" -- LGL225's syllabus title really is
   "Immigration Law" and there is nothing to shorten. The test is that the long
   ones got shorter, and nothing arrives trailing "for Paralegals". */
check("the phone calendar uses the short course names",
  nm2.phone.length > 0 && nm2.phone.every((n) => !/ for Paralegals$/.test(n)), nm2.phone);
check("and courses.csv still holds the syllabus's own titles",
  nm2.full.some((n) => /for Paralegals$/.test(n)), nm2.full.slice(0, 2));

// The sub-header holds while the week's classes scroll past it.
const stick = await evalJs(`(() => {
  const w = document.querySelector('#main'), bar = document.querySelector('.calbar');
  const before = Math.round(bar.getBoundingClientRect().top);
  w.scrollTop = 600;
  const after = Math.round(bar.getBoundingClientRect().top);
  const scrolled = Math.round(w.scrollTop);
  w.scrollTop = 0;
  return JSON.stringify({ before, after, scrolled });
})()`);
const sk = JSON.parse(stick.v);
check("the calendar scrolls inside its own box on a phone", sk.scrolled > 0, sk);
check("the week stepper stays put while the classes scroll past", sk.before === sk.after, sk);

/* The list runs top-to-bottom in the same order the desktop's columns run
   left-to-right -- WEEK_ORDER, which is Rafael's own week order and not the
   clock's. Asserted as non-decreasing rank rather than a literal list, so
   reordering WEEK_ORDER does not fail a test that is about agreement between
   two screens, not about any particular order. */
const ord = await evalJs(`JSON.stringify({
  ranks: [...document.querySelectorAll('.calrow')].map(e => rank(e.dataset.c)),
  codes: [...document.querySelectorAll('.calrow')].map(e => e.dataset.c)
})`);
const od = JSON.parse(ord.v);
check("the phone list runs in the same order as the desktop's columns",
  od.ranks.every((r, i) => i === 0 || od.ranks[i - 1] <= r), od.codes);

/* A tick forty rows down must not throw you back to the top. It did until
   28 Sep 2026: render() restored window.scrollY, and on a phone the window is
   not the scroller -- #main is -- so the restore silently did nothing and every
   tick jumped the list to row one.

   render() is called directly rather than by clicking a chip: a tick is the
   thing that triggers this, but the mechanism under test is the restore, and
   calling it here keeps data/progress.csv out of it. The chip cycle is
   not-started -> in progress -> done, so there is no single click that undoes
   a click, and this test has no business leaving a chapter marked read. */
const keep = await evalJs(`(() => {
  const w = document.querySelector('#main');
  w.scrollTop = 400;
  const before = Math.round(w.scrollTop);
  render();
  const after = Math.round(document.querySelector('#main').scrollTop);
  document.querySelector('#main').scrollTop = 0;
  return JSON.stringify({ before, after });
})()`);
const kp = JSON.parse(keep.v);
check("a re-render keeps your place in the list", kp.before > 0 && kp.after === kp.before, kp);

/* ...and stepping the week does the opposite, on purpose: new content starts at
   the top, because the arrows are in the sticky bar and you have not read the
   start of the week you just asked for. */
const step = await evalJs(`(async () => {
  const w = document.querySelector('#main');
  w.scrollTop = 400;
  const before = Math.round(w.scrollTop);
  document.querySelector('#cal-next').click();
  await new Promise(r => setTimeout(r, 900));
  return JSON.stringify({ before, after: Math.round(document.querySelector('#main').scrollTop) });
})()`);
const sp = JSON.parse(step.v);
check("but stepping to another week starts at the top of it",
  sp.before > 0 && sp.after === 0, sp);

/* The obsolete property that caused it. Its documented failure is exactly what
   Rafael reported twice -- reach the bottom and the next swipe is swallowed --
   and it breaks position: sticky in its own descendants on iOS, which .calbar
   is. There is no version of this app that should declare it. */
const css = await evalJs(`fetch('/app.css').then(r => r.text()).then(t => JSON.stringify({
  legacy: /-webkit-overflow-scrolling *:/.test(t)
}))`);
check("nothing asks iOS for the obsolete momentum scroller",
  JSON.parse(css.v).legacy === false, css.v);

// Stepping weeks, from the strip and from the arrows.
await evalJs(`document.querySelector('[data-calweek="7"]').click(); "ok"`);
await sleep(900);
const wk7 = await evalJs(`JSON.stringify({
  hash: location.hash,
  label: document.querySelector('.calwk .t b')?.textContent.trim(),
  on: document.querySelector('.calcell.on')?.textContent.trim() })`);
const w7 = JSON.parse(wk7.v);
check("tapping a week on the strip opens it", w7.label === "Week 7" && w7.on === "7" && /grid\/7$/.test(w7.hash), w7);
await evalJs(`document.querySelector('#cal-prev').click(); "ok"`);
await sleep(900);
const wk6 = await evalJs(`document.querySelector('.calwk .t b')?.textContent.trim()`);
check("the arrows step it", wk6.v === "Week 6", wk6.v);
await go("grid");

// 3. The timetable is a day list on a phone, not the drawn-to-scale chart.
await go("timetable");
const phoneTT = await evalJs(`JSON.stringify({
  chart: document.querySelectorAll('.tt').length,
  days: document.querySelectorAll('.ttday').length,
  blocks: document.querySelectorAll('.ttb').length,
  next: document.querySelectorAll('.ttb.next').length
})`);
const pt = JSON.parse(phoneTT.v);
// the button must name the theme actually on the screen, not the stored one
const lbl = await evalJs(`JSON.stringify({
  attr: document.documentElement.dataset.theme || "(none)",
  btn: document.querySelector('#theme').textContent.trim() })`);
const lb = JSON.parse(lbl.v);
check("the theme button names the theme on screen",
  lb.attr === "(none)" || new RegExp(lb.attr, "i").test(lb.btn), lb);
check("the phone timetable is a day list, not the chart",
  pt.chart === 0 && pt.days === 4 && pt.blocks === 11, pt);
check("exactly one block is flagged as next", pt.next === 1, pt);

// 4. The detail sheet: a phone row cannot carry "open book, plus tool kit" as
// well as a name and a date, so a tap brings the lot.
await go("week");
await evalJs(`document.querySelector('.card[data-sheet]').click(); "ok"`);
await sleep(500);
const sheet = await evalJs(`JSON.stringify({
  open: !!document.querySelector('.sheetbody'),
  keys: [...document.querySelectorAll('.sheetbody dt')].map(e => e.textContent.trim()),
  locked: getComputedStyle(document.body).overflow
})`);
const sv = JSON.parse(sheet.v);
check("tapping a card opens its detail sheet", sv.open, sv);
check("the sheet always states due, weight and scope",
  ["Due", "Weight", "Scope"].every((k) => sv.keys.includes(k)), sv.keys);
check("the page behind it cannot scroll", sv.locked === "hidden", sv.locked);
await evalJs(`document.querySelector('#sheet-back').click(); "ok"`);
await sleep(400);
const shut = await evalJs(`!!document.querySelector('.sheetbody')`);
check("and the backdrop closes it", shut.v === false, shut.v);

await send("Emulation.setDeviceMetricsOverride",
  { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false }, S);

// ------------------------------------------- storage that will not answer
// The bug Rafael photographed on 27 Sep 2026: an iPhone showing a DARK page
// with the button reading "Light". localStorage throws on iOS when site data
// is blocked or the tab is private, the stamp that sets data-theme sat inside
// the same try as the read, and one throw left the attribute absent -- so the
// prefers-color-scheme rule matched and the phone's own dark setting won,
// while the button (reading a storage that also threw) said light.
//
// Reproduced exactly here: no storage, system set to dark. The page must come
// up LIGHT, and the button must agree with it. This is the check that was
// missing; everything else about the theme was already covered.
const { result: injected } = await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `Object.defineProperty(window, "localStorage", {
    get() { throw new DOMException("blocked", "SecurityError"); } });`,
}, S);
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }, S);
await send("Emulation.setDeviceMetricsOverride",
  { width: 412, height: 915, deviceScaleFactor: 2, mobile: true }, S);
await go("week");
const blocked = await evalJs(`JSON.stringify({
  attr: document.documentElement.dataset.theme || "(none)",
  btn: document.querySelector('#theme')?.textContent.trim(),
  bg: getComputedStyle(document.body).backgroundColor
})`);
const bl = JSON.parse(blocked.v);
check("a phone that cannot use storage still opens light",
  bl.attr === "light" && bl.bg === "rgb(243, 242, 242)", bl);
check("and the button says what the page is actually showing",
  /Light/.test(bl.btn || ""), bl);
const tapped = await evalJs(`(() => { document.querySelector('#theme').click(); return JSON.stringify({
  attr: document.documentElement.dataset.theme,
  btn: document.querySelector('#theme').textContent.trim(),
  bg: getComputedStyle(document.body).backgroundColor }); })()`);
const tp = JSON.parse(tapped.v);
check("and the toggle still works without anywhere to save it",
  tp.attr === "dark" && tp.bg === "rgb(22, 21, 20)" && /Dark/.test(tp.btn), tp);
await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: injected.identifier }, S);
await send("Emulation.setDeviceMetricsOverride",
  { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false }, S);

console.log(`\n${pass} passed, ${fail} failed`);
if (logs.length) { console.log("\nbrowser errors:"); logs.forEach((l) => console.log("  " + l)); }
ws.close(); chrome.kill();
process.exit(fail || logs.length ? 1 : 0);
