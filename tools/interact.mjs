// Exercise the interactive paths a static render cannot reach: ticking a
// chapter, the per-course master tick, the theme toggle, week stepping by
// button and by key, the density toggle, and deep links.
//
// Updated 13 Sep 2026 for the sidebar layout: the week label lives in the
// stepper row, the term strip became the runway, the READ counter sits in the
// readings section head, and the Exams view became Deadlines (with #exams
// kept as an alias so old bookmarks still land).
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
let before = await evalJs(`document.querySelector('${firstChip}').dataset.s`);
const rid = (await evalJs(`document.querySelector('${firstChip}').dataset.reading`)).v;
await click(firstChip); await sleep(900);
let after = await evalJs(`document.querySelector('[data-reading="${rid}"]').dataset.s`);
check("chapter tick: blank -> in_progress", before.v === "" && after.v === "in_progress", { before: before.v, after: after.v });

await click(`[data-reading="${rid}"]`); await sleep(900);
after = await evalJs(`document.querySelector('[data-reading="${rid}"]').dataset.s`);
check("chapter tick: in_progress -> done", after.v === "done", after.v);

let srv = await (await fetch("http://127.0.0.1:8787/api/data")).json();
check("progress persisted to the server", srv.progress.some((p) => p.reading_id === rid && p.status === "done"), srv.progress);

// the x-of-y counter in the readings section head must move
let counter = await evalJs(`document.querySelector('.sechead .mono')?.textContent.replace(/\\s+/g,' ').trim()`);
check("the readings counter counts the tick", /^1 of 13 done$/.test(counter.v || ""), counter.v);

await click(`[data-reading="${rid}"]`); await sleep(900);   // back to blank
after = await evalJs(`document.querySelector('[data-reading="${rid}"]').dataset.s`);
check("chapter tick: done -> blank", after.v === "", after.v);
srv = await (await fetch("http://127.0.0.1:8787/api/data")).json();
check("clearing removes the row, no ghost", !srv.progress.some((p) => p.reading_id === rid && p.status), srv.progress);

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
const wkText = () => evalJs(`document.querySelector('.gtools > b')?.textContent.trim()`);
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
check("theme starts on auto", JSON.parse((await themeState()).v).attr === "", (await themeState()).v);
await click("#theme"); await sleep(250);
let t = JSON.parse((await themeState()).v);
check("theme -> light sets the attribute and persists", t.attr === "light" && t.ls === "light" && /Light/.test(t.btn), t);
await click("#theme"); await sleep(250);
t = JSON.parse((await themeState()).v);
check("theme -> dark", t.attr === "dark" && t.ls === "dark", t);
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, S);
await sleep(200);
const bgDark = await evalJs(`getComputedStyle(document.body).backgroundColor`);
check("explicit dark wins over a light system", bgDark.v === "rgb(22, 21, 20)", bgDark.v);
await click("#theme"); await sleep(250);
t = JSON.parse((await themeState()).v);
check("theme cycles back to auto", t.attr === "" && t.ls === "auto", t);
const bgAuto = await evalJs(`getComputedStyle(document.body).backgroundColor`);
check("auto follows the light system", bgAuto.v === "rgb(243, 242, 242)", bgAuto.v);
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }, S);
await sleep(200);
const bgAutoDark = await evalJs(`getComputedStyle(document.body).backgroundColor`);
check("auto follows a dark system too", bgAutoDark.v === "rgb(22, 21, 20)", bgAutoDark.v);

// ---------------------------------------------------------------- density
await go("grid");
const chVisible = () => evalJs(`getComputedStyle(document.querySelector('.gcell .ch')).display`);
check("term grid shows chapters by default", (await chVisible()).v !== "none", (await chVisible()).v);
await click("#deadlines-only"); await sleep(900);
check("deadlines-only hides the chapter runs", (await chVisible()).v === "none", (await chVisible()).v);
check("density persisted", (await evalJs(`localStorage.getItem("beagle-density")`)).v === "compact", null);
await go("grid");   // reload: must not flash the wide layout
check("density survives a reload", (await chVisible()).v === "none", (await chVisible()).v);
await click("#density"); await sleep(900);   // the sidebar switch is the same setting
check("the sidebar density toggle turns it back", (await chVisible()).v !== "none", (await chVisible()).v);

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
