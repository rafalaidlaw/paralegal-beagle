// Render every view of app.js against the real /api/data payload in a minimal
// DOM shim, and fail loudly if any of them throws or renders nothing.
import fs from "node:fs";
import vm from "node:vm";

const PORT = process.env.PORT || "8792";
const payload = await (await fetch(`http://127.0.0.1:${PORT}/api/data`)).json();

const el = () => ({
  textContent: "", innerHTML: "", value: "", style: {}, dataset: {},
  classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
  addEventListener() {}, closest: () => null, querySelector: () => el(),
  set onclick(_) {},
});

const doc = {
  querySelector: () => el(),
  querySelectorAll: () => [],
  addEventListener() {},
  createElement: () => el(),
};

const ctx = {
  document: doc,
  fetch: async () => ({ ok: true, json: async () => payload }),
  alert: (m) => { throw new Error("alert(): " + m); },
  confirm: () => true,
  console,
  encodeURIComponent,
  Math, Number, String, Object, Array, JSON, Date, RegExp, Set, Map, isNaN, parseInt, parseFloat,
};
ctx.globalThis = ctx;
ctx.window = { addEventListener() {}, location: { hash: "" } };
ctx.location = ctx.window.location;

let src = fs.readFileSync("app/app.js", "utf8");
// The file self-starts with load(); neutralise that and expose the internals.
src = src.replace(/^load\(\)\.catch[\s\S]*$/m, "");
src += "\n;globalThis.__VIEWS = VIEWS; globalThis.__setD = (d) => { D = d; };"
     + "globalThis.__state = state; globalThis.__md = md; globalThis.__review = reviewItems;";

vm.createContext(ctx);
try {
  new vm.Script(src, { filename: "app.js" }).runInContext(ctx);
} catch (e) {
  console.error("FAIL: app.js did not evaluate:", e.message);
  process.exit(1);
}

ctx.__setD(payload);

let bad = 0;
const names = Object.keys(ctx.__VIEWS);
console.log(`rendering ${names.length} views against ${payload.schedule.length} schedule rows\n`);

for (const name of names) {
  try {
    const html = ctx.__VIEWS[name]();
    if (typeof html !== "string" || html.length < 80) {
      console.log(`  FAIL ${name.padEnd(9)} produced ${html && html.length} chars`);
      bad++;
      continue;
    }
    if (/undefined|NaN|\[object Object\]/.test(html)) {
      const m = html.match(/.{0,60}(undefined|NaN|\[object Object\]).{0,60}/);
      console.log(`  FAIL ${name.padEnd(9)} leaked a placeholder: …${m[0].replace(/\s+/g, " ")}…`);
      bad++;
      continue;
    }
    console.log(`  ok   ${name.padEnd(9)} ${String(html.length).padStart(6)} chars`);
  } catch (e) {
    console.log(`  FAIL ${name.padEnd(9)} threw: ${e.message}`);
    bad++;
  }
}

// per-course view too, since it takes a parameter through state
console.log("\nper-course render:");
for (const c of payload.courses) {
  ctx.__state.course = c.code;
  try {
    const html = ctx.__VIEWS.courses();
    const leak = html.match(/(undefined|NaN|\[object Object\])/);
    console.log(`  ${leak ? "FAIL" : "ok  "} ${c.code} ${String(html.length).padStart(6)} chars${leak ? " leaked " + leak[1] : ""}`);
    if (leak) bad++;
  } catch (e) {
    console.log(`  FAIL ${c.code} threw: ${e.message}`);
    bad++;
  }
}

// markdown renderer
console.log("\nmarkdown:");
const mdOut = ctx.__md("# H\n\n- a\n- b\n\n**bold** and `code` and [x](http://y)\n\n> quote\n\n---\n");
for (const tag of ["<h1>", "<ul>", "<li>", "<b>", "<code>", "<a href=", "<blockquote>", "<hr>"]) {
  const got = mdOut.includes(tag);
  console.log(`  ${got ? "ok  " : "FAIL"} ${tag}`);
  if (!got) bad++;
}
const xss = ctx.__md("<img src=x onerror=alert(1)>");
console.log(`  ${xss.includes("<img") ? "FAIL" : "ok  "} raw HTML is escaped`);
if (xss.includes("<img")) bad++;

console.log(`\nreview queue: ${ctx.__review().length} items`);
console.log(bad ? `\nFAIL: ${bad} problem(s)` : "\nPASS: all views render clean");
process.exit(bad ? 1 : 0);
