// Does the PUBLISHED copy work? Everything else in tools/ tests the app with
// python serve.py behind it; this one tests dist/, which has no server at all.
//
//   python build_static.py && node tools/statictest.mjs
//
// It serves dist/ itself on its own port, so it never touches the running app
// and never needs 8787 free. Three things can only go wrong here:
//
//   1. data.json is missing a key the client reads, and the page dies before
//      its first render. That happened: dropping grades/cases/notes to keep
//      them private took the sidebar counts down with them.
//   2. "today" is frozen at the moment dist/ was built, which on a screen that
//      counts down is worse than showing no date at all.
//   3. A chapter tick has nowhere to save. On the published copy it goes to
//      this browser's localStorage, laid over the snapshot rather than into
//      it, so re-publishing never wipes a tick made on the phone.
import { spawn } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SITE = Number(process.env.PORT) || 8799;
if (!existsSync(join(ROOT, "dist", "data.json"))) {
  console.error("no dist/data.json -- run `python build_static.py` first");
  process.exit(1);
}
const site = spawn("python", ["-m", "http.server", String(SITE), "--bind", "127.0.0.1",
  "--directory", "dist"], { cwd: ROOT, stdio: "ignore" });

const PORT = 9477;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = mkdtempSync(join(tmpdir(), "tick-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run",
  "--no-default-browser-check", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws;
for (let i = 0; i < 40 && !ws; i++) {
  try { ws = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; }
  catch { await sleep(250); }
}
const { WebSocket } = await import("ws").catch(() => ({ WebSocket: globalThis.WebSocket }));
const sock = new WebSocket(ws);
await new Promise((r) => sock.addEventListener("open", r));
let id = 0;
const waiting = new Map();
sock.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
});
const send = (method, params = {}, sessionId) => new Promise((res) => {
  const n = ++id;
  waiting.set(n, res);
  sock.send(JSON.stringify({ id: n, method, params, sessionId }));
});

const { result: t } = await send("Target.createTarget", { url: "about:blank" });
const { result: att } = await send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
const S = att.sessionId;
await send("Page.enable", {}, S);
await send("Runtime.enable", {}, S);

const evalJs = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, S);
  return r.result?.result?.value;
};
const go = async (hash) => {
  await send("Page.navigate", { url: `http://127.0.0.1:${SITE}/#${hash}` }, S);
  await sleep(1400);
};

let pass = 0, fail = 0;
const check = (name, ok, got) => {
  if (ok) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + "  ->  " + JSON.stringify(got)); }
};

await go("grid");
check("the published copy renders from data.json, with no server",
  (await evalJs(`document.querySelectorAll('.gcell').length`)) > 50,
  await evalJs(`document.querySelectorAll('.gcell').length`));
check("it knows it is the published copy", (await evalJs(`STATIC`)) === true, await evalJs(`STATIC`));
check("today is the browser's own date, not the day the file was built",
  (await evalJs(`D.today`)) === new Date().toLocaleDateString("en-CA"),
  { app: await evalJs(`D.today`), browser: new Date().toLocaleDateString("en-CA") });

const firstId = await evalJs(`document.querySelector('.chch[data-s=""]')?.dataset.reading || ""`);
await evalJs(`document.querySelector('.chch[data-s=""]').click()`);
await sleep(900);
const after = await evalJs(`document.querySelector('.chch[data-reading="${firstId}"]')?.dataset.s`);
check("a tick changes state with no server to save to", after === "in_progress", after);
check("it is written to this browser",
  JSON.parse(await evalJs(`localStorage.getItem("beagle-ticks") || "{}"`))[firstId] === "in_progress",
  await evalJs(`localStorage.getItem("beagle-ticks")`));

await go("grid");
const reloaded = await evalJs(`document.querySelector('.chch[data-reading="${firstId}"]')?.dataset.s`);
check("and it survives a reload", reloaded === "in_progress", reloaded);

// three states, so two more clicks -- each one awaited, because the click
// handler is async and a second click on the stale node is swallowed
for (let i = 0; i < 2; i++) {
  await evalJs(`document.querySelector('.chch[data-reading="${firstId}"]').click()`);
  await sleep(900);
}
const cleared = await evalJs(`JSON.parse(localStorage.getItem("beagle-ticks") || "{}")["${firstId}"]`);
check("cycling back to not-started clears it rather than storing a blank", cleared === "", cleared);

const snapKept = await evalJs(`SNAP.length`);
check("the published snapshot's own ticks are still there underneath", snapKept > 0, snapKept);

console.log(`\n${pass} passed, ${fail} failed`);
chrome.kill();
site.kill();
process.exit(fail ? 1 : 0);
