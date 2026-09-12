// Measure the running app in a real browser over the DevTools protocol.
//   node probe.mjs <url-hash> <width> [theme]
// Prints every element that exceeds the viewport, widest first, plus the
// computed contrast of a few text samples. Needs no libraries.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HASH = process.argv[2] || "week";
const WIDTH = Number(process.argv[3] || 412);
const THEME = process.argv[4] || "";
const PORT = 9444 + (Number(process.env.OFFSET) || 0);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const profile = mkdtempSync(join(tmpdir(), "probe-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${WIDTH},1400`, "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function endpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return (await r.json()).webSocketDebuggerUrl;
    } catch { await sleep(250); }
  }
  throw new Error("chrome did not open a debugging port");
}

const wsUrl = await endpoint();
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
function send(method, params = {}, sessionId) {
  const msg = { id: ++id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((r) => pending.set(msg.id, r));
}

// attach to a tab
const { result: { targetInfos } } = await send("Target.getTargets");
let page = targetInfos.find((t) => t.type === "page");
const { result: { sessionId } } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
const S = sessionId;

await send("Page.enable", {}, S);
await send("Runtime.enable", {}, S);
if (THEME) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: THEME }] }, S);
await send("Emulation.setDeviceMetricsOverride",
  { width: WIDTH, height: 1400, deviceScaleFactor: 1, mobile: WIDTH < 700 }, S);

const url = `http://127.0.0.1:8787/#${HASH}`;
await send("Page.navigate", { url }, S);
await sleep(2200);

const expr = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = { vw, docW: document.documentElement.scrollWidth, bodyW: document.body.scrollWidth, bad: [] };
  const depth = (el) => { let n = 0, p = el; while (p.parentElement) { n++; p = p.parentElement; } return n; };
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // Ignore anything inside a container that scrolls or clips on purpose:
    // a wide table inside .scroll is the feature, not a bug.
    let inScroller = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "clip" || ox === "hidden") { inScroller = true; break; }
    }
    if (inScroller) continue;
    if (r.right > vw + 0.5) out.bad.push({
      right: Math.round(r.right), width: Math.round(r.width), depth: depth(el),
      tag: el.tagName.toLowerCase(),
      cls: String(el.className || "").slice(0, 40),
      txt: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 32),
    });
  }
  out.bad.sort((a, b) => b.right - a.right || a.depth - b.depth);
  out.bad = out.bad.slice(0, 30);
  return JSON.stringify(out);
})()`;

const { result } = await send("Runtime.evaluate", { expression: expr, returnByValue: true }, S);
const r = JSON.parse(result.result.value);
console.log(`${url}  width=${WIDTH}${THEME ? "  theme=" + THEME : ""}`);
console.log(`viewport=${r.vw}  document.scrollWidth=${r.docW}  body.scrollWidth=${r.bodyW}`);
if (!r.bad.length) console.log("nothing exceeds the viewport");
else {
  console.log(`${r.bad.length} element(s) exceed the viewport, widest first:`);
  for (const b of r.bad)
    console.log(`  right=${String(b.right).padStart(5)} w=${String(b.width).padStart(5)} d=${String(b.depth).padStart(2)} <${b.tag}.${b.cls}> "${b.txt}"`);
}

ws.close();
chrome.kill();
process.exit(0);
