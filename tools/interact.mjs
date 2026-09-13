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
await evalJs(`document.querySelector('#nav a[data-view="crunch"]').click()`); await sleep(1200);
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
check("lands on the current week", /Week 1 of 15/.test((await wkText()).v || ""), (await wkText()).v);
await click("#wk-next"); await sleep(1200);
check("next-week button steps forward", /Week 2 of 15/.test((await wkText()).v || ""), (await wkText()).v);
await key("]"); await sleep(1200);
check("] key steps forward", /Week 3 of 15/.test((await wkText()).v || ""), (await wkText()).v);
await key("["); await sleep(1200);
check("[ key steps back", /Week 2 of 15/.test((await wkText()).v || ""), (await wkText()).v);
check("the hash follows the week", (await evalJs("location.hash")).v === "#week/2", (await evalJs("location.hash")).v);
await click("#wk-today"); await sleep(1000);
check("back-to-this-week returns to week 1", /Week 1 of 15/.test((await wkText()).v || ""), (await wkText()).v);
const stripNow = await evalJs(`document.querySelectorAll('.runway.now').length`);
check("exactly one runway row is marked now", stripNow.v === 1, stripNow.v);
const sideWeek = await evalJs(`document.querySelector('#wk-big')?.textContent.trim()`);
check("the sidebar shows the current week, zero-padded", sideWeek.v === "01", sideWeek.v);

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
const lsoVisible = () => evalJs(`getComputedStyle(document.querySelector('.gcell .lso')).display`);
check("term grid shows chapters by default", (await chVisible()).v !== "none", (await chVisible()).v);
await click("#deadlines-only"); await sleep(900);
check("deadlines-only hides the chapter runs", (await chVisible()).v === "none", (await chVisible()).v);
check("deadlines-only hides the competency lines too", (await lsoVisible()).v === "none", (await lsoVisible()).v);
check("deadlines-only persisted on its own key", (await evalJs(`localStorage.getItem("beagle-deadlines-only")`)).v === "1", null);
await go("grid");   // reload: must not flash the wide layout
check("deadlines-only survives a reload", (await chVisible()).v === "none", (await chVisible()).v);
await click("#deadlines-only"); await sleep(900);
check("toggling deadlines-only back shows chapters", (await chVisible()).v !== "none", (await chVisible()).v);
check("...and the competency lines", (await lsoVisible()).v !== "none", (await lsoVisible()).v);
// the spacing toggle is gone (compact is the only spacing now); the sidebar
// footer holds the theme button alone
check("no density button in the sidebar", (await evalJs(`document.querySelector('#density')`)).v === null, null);

// ---------------------------------------------------------------- one tick, every view
// The Term Grid carries the same chips as This Week and Courses, all reading
// one progress row, so a tick made in the grid must show on the other two.
// `rid` was cycled to blank at the top of this run.
await go("grid");
const gridState = async () => (await evalJs(`document.querySelector('.gcell [data-reading="${rid}"]')?.dataset.s`)).v;
check("the grid shows a tick chip for the first reading", (await gridState()) === "", await gridState());
await click(`.gcell [data-reading="${rid}"]`); await sleep(900);
check("ticking in the grid: blank -> in_progress", (await gridState()) === "in_progress", await gridState());
await go("week");
check("the same tick shows on This Week", (await stateOf()) === "in_progress", await stateOf());
await go(`courses/${rid.slice(0, 6)}`);
check("the same tick shows on Courses", (await stateOf()) === "in_progress", await stateOf());
await click(`[data-reading="${rid}"]`); await sleep(700);     // done, ticked on Courses this time
await go("grid");
check("a tick made on Courses shows in the grid", (await gridState()) === "done", await gridState());
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
// Six syllabi print "LSO Competencies: n, n" beside a class's readings; the
// numbers travel with the schedule row and are shown wherever its chapters are.
await go("week/2");
const lsoWeek = await evalJs(`[...document.querySelectorAll('.rrow .lso')].map(e => e.textContent.trim())`);
check("This Week lists a class's LSO competencies", (lsoWeek.v || []).includes("LSO competencies 171, 172, 170"), lsoWeek.v);
await go("courses/LGL151");
const lsoCourse = await evalJs(`[...document.querySelectorAll('.rrow .lso')].map(e => e.textContent.trim())`);
check("Courses lists them on the schedule rows", (lsoCourse.v || []).includes("LSO competencies 171, 172, 170"), lsoCourse.v);
await go("grid");
const lsoGrid = await evalJs(`JSON.stringify({ n: document.querySelectorAll('.gcell .lso').length, first: document.querySelector('.gcell .lso')?.textContent.trim() })`);
const lg = JSON.parse(lsoGrid.v);
check("the grid carries them in short form", lg.n >= 60 && /^LSO \d+(, \d+)*$/.test(lg.first || ""), lg);
const lsoNone = await evalJs(`[...document.querySelectorAll('.grow:not(.head)')].some(r => r.children[4].querySelector('.lso'))`);
check("LGL154 lists none, so its column shows none", lsoNone.v === false, lsoNone.v);

// ---------------------------------------------------------------- deep links
await go("courses/LGL225");
const sel = await evalJs(`document.querySelector("#csel").value`);
check("#courses/LGL225 opens that course", sel.v === "LGL225", sel.v);
await go("week");
const pillHref = await evalJs(`document.querySelector('.card a.course-pill')?.getAttribute("href")`);
check("card pills link into Courses", /^#courses\/LGL\d{3}$/.test(pillHref.v || ""), pillHref.v);
const navCount = await evalJs(`document.querySelector('#nav a[data-view="review"] .count')?.textContent.trim()`);
check("the sidebar shows the review count", /^\d+$/.test(navCount.v || ""), navCount.v);
const navOn = await evalJs(`document.querySelectorAll('#nav a.on').length`);
check("exactly one nav item is active", navOn.v === 1, navOn.v);

// ---------------------------------------------------------------- deadlines
await go("exams");   // the old hash must still land somewhere sensible
const title = await evalJs(`document.querySelector("#vtitle")?.textContent.trim()`);
check("#exams aliases to Deadlines", title.v === "Deadlines", title.v);
const nextRows = await evalJs(`document.querySelectorAll('.drow.next').length`);
check("exactly one deadline row is marked next", nextRows.v === 1, nextRows.v);
const months = await evalJs(`[...document.querySelectorAll('.month')].map(m => m.textContent.trim())`);
check("deadlines are grouped by month", Array.isArray(months.v) && months.v.length >= 3, months.v);

console.log(`\n${pass} passed, ${fail} failed`);
if (logs.length) { console.log("\nbrowser errors:"); logs.forEach((l) => console.log("  " + l)); }
ws.close(); chrome.kill();
process.exit(fail || logs.length ? 1 : 0);
