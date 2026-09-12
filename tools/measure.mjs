// Measure specific elements in the running app.
//   node measure.mjs <hash> <width> <selector> [selector...]
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HASH = process.argv[2], WIDTH = Number(process.argv[3]);
const SELS = process.argv.slice(4);
const PORT = 9477;
const profile = mkdtempSync(join(tmpdir(), "meas-"));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 80 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; }
  catch { await sleep(250); }
}
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (m, p = {}, s) => { const x = { id: ++id, method: m, params: p }; if (s) x.sessionId = s; ws.send(JSON.stringify(x)); return new Promise((r) => pend.set(x.id, r)); };
const { result: { targetInfos } } = await send("Target.getTargets");
const { result: { sessionId: S } } = await send("Target.attachToTarget", { targetId: targetInfos.find((t) => t.type === "page").targetId, flatten: true });
await send("Page.enable", {}, S); await send("Runtime.enable", {}, S);
await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 1400, deviceScaleFactor: 1, mobile: WIDTH < 700 }, S);
await send("Page.navigate", { url: `http://127.0.0.1:8787/#${HASH}` }, S);
await sleep(2200);

const expr = `(() => {
  const sels = ${JSON.stringify(SELS)};
  const lines = [];
  for (const sel of sels) {
    const els = [...document.querySelectorAll(sel)];
    lines.push(sel + "  -> " + els.length + " match(es)");
    for (const el of els.slice(0, 6)) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      lines.push("   w=" + Math.round(r.width) + " h=" + Math.round(r.height) +
        "  font=" + cs.fontSize + "/" + cs.lineHeight + " " + cs.fontWeight +
        "  pad=" + cs.padding + "  ws=" + cs.whiteSpace +
        "  fam=" + cs.fontFamily.split(",")[0] +
        '  "' + (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 40) + '"');
    }
  }
  return lines.join("\\n");
})()`;
const { result } = await send("Runtime.evaluate", { expression: expr, returnByValue: true }, S);
console.log(result.result.value);
ws.close(); chrome.kill(); process.exit(0);
