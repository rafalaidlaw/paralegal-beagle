// Trustworthy screenshots of the running app: the CSS viewport and the colour
// scheme are both set over the DevTools protocol, because Chrome's
// --window-size / --force-prefers-color-scheme flags do neither reliably in
// headless mode (they produced phone shots that looked clipped when the page
// was in fact fine at 412px).
//
//   node shot.mjs OUTDIR [views...]
// Writes <view>.png (1440 dark), <view>-light.png (1440 light),
//        <view>-phone.png (412 dark).
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const OUT = resolve(process.argv[2] || "shots");
const VIEWS = process.argv.slice(3).length ? process.argv.slice(3)
  : ["week", "grid", "crunch", "exams", "courses", "notes", "cases", "review"];
const PORT = 9455;
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
mkdirSync(OUT, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), "shot-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--hide-scrollbars",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function endpoint() {
  for (let i = 0; i < 80; i++) {
    try { return (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; }
    catch { await sleep(250); }
  }
  throw new Error("no debugging port");
}
const ws = new WebSocket(await endpoint());
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sessionId) => {
  const msg = { id: ++id, method, params }; if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((r) => pending.set(msg.id, r));
};

const { result: { targetInfos } } = await send("Target.getTargets");
const { result: { sessionId: S } } = await send("Target.attachToTarget",
  { targetId: targetInfos.find((t) => t.type === "page").targetId, flatten: true });
await send("Page.enable", {}, S);
await send("Runtime.enable", {}, S);

async function shoot(view, width, scheme, file) {
  await send("Emulation.setEmulatedMedia",
    { features: [{ name: "prefers-color-scheme", value: scheme }] }, S);
  await send("Emulation.setDeviceMetricsOverride",
    { width, height: 1200, deviceScaleFactor: 1, mobile: width < 700 }, S);
  await send("Page.navigate", { url: `http://127.0.0.1:8787/#${view}` }, S);
  await sleep(1700);
  // grow the viewport to the full document so nothing is cut off
  const { result: h } = await send("Runtime.evaluate",
    { expression: "Math.min(document.documentElement.scrollHeight, 8000)", returnByValue: true }, S);
  await send("Emulation.setDeviceMetricsOverride",
    { width, height: h.result.value, deviceScaleFactor: 1, mobile: width < 700 }, S);
  await sleep(450);
  const { result: shot } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, S);
  writeFileSync(join(OUT, file), Buffer.from(shot.data, "base64"));
  return h.result.value;
}

for (const v of VIEWS) {
  const a = await shoot(v, 1440, "dark", `${v}.png`);
  const b = await shoot(v, 1440, "light", `${v}-light.png`);
  const c = await shoot(v, 412, "dark", `${v}-phone.png`);
  console.log(`  ${v.padEnd(8)} dark ${String(a).padStart(5)}px   light ${String(b).padStart(5)}px   phone ${String(c).padStart(5)}px`);
}

ws.close(); chrome.kill(); process.exit(0);
