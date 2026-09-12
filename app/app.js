/* Paralegal Beagle — all views. Vanilla JS, no framework, no CDN.
   data/*.csv is the source of truth; everything here is derived on each render. */

let D = null;
const state = {
  view: "week", course: null, notePath: null, target: 70,
  week: null,            // null = follow today; set by the < today > stepper
  sortDueByWeight: false,
};

const $ = (s, r = document) => r.querySelector(s);
const main = $("#main");

/* localStorage can throw (private window, blocked site data) and is absent in
   the test harness, so it is never touched without a guard. */
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const root = () => (typeof document !== "undefined" && document.documentElement) || null;

/* ------------------------------------------------------------ utilities */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

const toDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (s) => { if (!s) return ""; const x = toDate(s); return `${DOW[x.getDay()]} ${x.getDate()} ${MON[x.getMonth()]}`; };
const fmtShort = (s) => { if (!s) return ""; const x = toDate(s); return `${x.getDate()} ${MON[x.getMonth()]}`; };
const plus = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return iso(d); };

function daysBetween(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }
const today = () => D.today;
const termWeek = (s) => Math.floor(daysBetween(D.term.week1_monday, s) / 7) + 1;
const weekMonday = (n) => plus(D.term.week1_monday, (n - 1) * 7);
const LAST_WEEK = () => termWeek(D.term.end);
const clampWeek = (n) => Math.max(1, Math.min(LAST_WEEK(), n));

/* The week the user is LOOKING at. Defaults to today's week; the stepper and
   the #week/N route move it without touching what "today" means anywhere else. */
const shownWeek = () => state.week == null ? clampWeek(termWeek(today())) : state.week;

const progressMap = () => Object.fromEntries(D.progress.map((p) => [p.reading_id, p]));
const gradeMap = () => Object.fromEntries(D.grades.map((g) => [g.assessment_id, g]));
const course = (code) => D.courses.find((c) => c.code === code) || {};
const courseName = (code) => course(code).name || code;
const isDone = (prog, id) => (prog[id]?.status || "") === "done";

/* Full titles belong in HEADINGS — eight codes differing by a digit are
   genuinely ambiguous there. In a dense row the title was longer than the
   item it labelled, so rows get the pill alone with the name on hover. */
const courseTag = (code) =>
  `<span class="course-pill" data-c="${esc(code)}">${esc(code)}</span> <span class="course-title">${esc(courseName(code))}</span>`;
const pill = (code) =>
  `<a class="course-pill" data-c="${esc(code)}" href="#courses/${esc(code)}" title="${esc(courseName(code))}">${esc(code)}</a>`;

/* A week-precision item has a WINDOW, not a date, so it needs two horizons
   and they do different jobs:
     dMin - the earliest it can happen (that week's Monday). Everything the
            student PLANS from uses this, because "in 9 days" is the honest
            warning for a quiz in the week of Mon 21 Sep. Measuring to the
            Sunday instead said 15 days and pushed it out of the fortnight.
     dMax - the last day of the window. Used only to decide whether the thing
            is actually late, since an item is not overdue until its week ends.
   Neither invents a weekday; the label still reads "week of Mon 21 Sep". */
const lastPossible = (a) => a.date_precision === "exact" ? a.due_resolved : plus(a.due_resolved, 6);
const dMin = (a) => daysBetween(today(), a.due_resolved);
const dMax = (a) => daysBetween(today(), lastPossible(a));
const isOverdue = (a) => dMax(a) < 0;
/* What to plan against: 0 once the window has opened, else the days to it. */
const daysLeft = (a) => Math.max(0, dMin(a));

function startBy(a) {
  if (!a.due_resolved) return "";
  return plus(a.due_resolved, -Number(a.lead_days || 7));
}

function dueSorted() {
  return D.assessments.filter((a) => a.due_resolved).slice()
    .sort((a, b) => a.due_resolved.localeCompare(b.due_resolved) || a.course.localeCompare(b.course));
}

/* One date formatter. Week precision is shown as a chip, not as a prefix that
   only exists in a tooltip — a phone has no hover. */
function whenLabel(a) {
  if (a.date_precision === "exact") return fmt(a.due_resolved);
  return `<span class="tag" title="The syllabus gives a week, not a day. It says: ${esc(a.due_date_raw)}">week of</span> ${fmt(a.due_resolved)}`;
}
function relLabel(a) {
  const lo = dMin(a), hi = dMax(a);
  if (hi < 0) return `${Math.abs(hi)}d ago`;
  if (lo <= 0) return a.date_precision === "exact" ? "today" : "this week";
  if (lo === 1) return "tomorrow";
  return `in ${lo}d`;
}
function urgencyClass(a) {
  if (isOverdue(a)) return "over";
  const lo = dMin(a);
  return lo <= 0 ? "today" : lo <= 3 ? "soon" : "";
}

/* ------------------------------------------------------------ networking */
async function load() {
  const r = await fetch("/api/data");
  D = await r.json();
  routeFromHash();
  chrome();
  render();
}

async function post(path, body) {
  const r = await fetch(path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) { alert(j.error || "request failed"); throw new Error(j.error); }
  return j;
}

/* ------------------------------------------------------------ chrome */
function chrome() {
  const wk = termWeek(today());
  const last = LAST_WEEK();
  $("#todaychip").textContent =
    wk < 1 ? "before term" : wk > last ? "term over" : `Week ${wk} of ${last} · ${fmt(today())}`;
  $("#footstats").textContent =
    `${D.courses.length} courses · ${D.schedule.length} class meetings · ${D.assessments.length} assessments · ${D.readings.length} chapter-readings`;
  const n = reviewItems().length;
  $("#reviewcount").textContent = n || "";
  $("#reviewcount").style.display = n ? "" : "none";
  paintThemeButton();
}

const THEMES = ["auto", "light", "dark"];
const THEME_LABEL = { auto: "◐ auto", light: "☀ light", dark: "☾ dark" };
function currentTheme() {
  const t = LS.get("beagle-theme");
  return THEMES.includes(t) ? t : "auto";
}
function paintThemeButton() {
  const b = $("#theme");
  if (b) b.textContent = THEME_LABEL[currentTheme()];
}
function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  LS.set("beagle-theme", next);
  const r = root();
  if (r) { if (next === "auto") delete r.dataset.theme; else r.dataset.theme = next; }
  paintThemeButton();
}

/* ------------------------------------------------------------ router */
const VIEWS = {};
function render() {
  document.querySelectorAll("#tabs button").forEach((b) =>
    b.classList.toggle("on", b.dataset.view === state.view));
  main.innerHTML = VIEWS[state.view]();
  main.scrollTop = 0;
}

/* #exams · #courses/LGL151 · #week/4 — all bookmarkable, Back works. */
function routeFromHash() {
  const raw = (location.hash || "").replace(/^#/, "");
  if (!raw) return;
  const [v, arg] = raw.split("/");
  if (!VIEWS[v]) return;
  state.view = v;
  if (v === "courses" && arg && D.courses.some((c) => c.code === arg)) state.course = arg;
  if (v === "week") state.week = arg ? clampWeek(Number(arg)) : null;
}

$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]");
  if (!b) return;
  state.view = b.dataset.view;
  if (b.dataset.view === "week") state.week = null;
  location.hash = b.dataset.view;
  render();
});

window.addEventListener("hashchange", () => { routeFromHash(); render(); });
$("#reload").addEventListener("click", load);
$("#theme").addEventListener("click", cycleTheme);

/* ==================================================================== WEEK */
VIEWS.week = () => {
  const wk = shownWeek();
  const nowWk = clampWeek(termWeek(today()));
  const prog = progressMap();
  const last = LAST_WEEK();
  let h = "";

  /* ---- 1. the headline: four tiles, one display-size number ---------- */
  const upcoming = dueSorted().filter((a) => !isOverdue(a));
  const next = upcoming[0];
  const weekReads = D.readings.filter((r) => r.week_no === wk);
  const doneReads = weekReads.filter((r) => isDone(prog, r.id)).length;
  const behind = D.readings.filter((r) => r.week_no < nowWk && !isDone(prog, r.id));
  const loadByWeek = crunchWeeks();
  const nextCrunch = loadByWeek.filter((x) => x.w >= nowWk && x.load > 0)
    .sort((a, b) => b.load - a.load || a.w - b.w)[0];

  h += `<div class="panel"><div class="cmd">`;
  if (next) {
    const n = daysLeft(next);
    const cls = n === 0 ? "now" : n <= 3 ? "hot" : n <= 7 ? "warn" : "";
    const open = dMin(next) <= 0;          /* the window has already opened */
    h += `<div class="stat" data-c="${esc(next.course)}">
      <span class="lbl">Next graded item</span>
      <span class="countdown ${cls}">${open ? (next.date_precision === "exact" ? "today" : "now") : n}${open ? "" : `<small> day${n === 1 ? "" : "s"}</small>`}</span>
      <div class="sub2"><b>${esc(next.course)} ${esc(next.name)}</b> · ${next.weight_pct}% of the course</div>
      <div class="sub2">${whenLabel(next)}</div>
    </div>`;
  } else {
    h += `<div class="stat"><span class="lbl">Next graded item</span>
      <b>nothing ahead</b><div class="sub2">Every dated item in the syllabi has passed.</div></div>`;
  }
  h += `<div class="stat"><span class="lbl">Read for week ${wk}</span>
      <b>${doneReads} / ${weekReads.length}</b>
      <div class="bar ${weekReads.length && doneReads === weekReads.length ? "ok" : ""}" style="margin-top:5px">
        <i style="width:${weekReads.length ? (doneReads / weekReads.length) * 100 : 0}%"></i></div>
      <div class="sub2">${weekReads.length ? `${weekReads.length} chapter${weekReads.length === 1 ? "" : "s"} across ${new Set(weekReads.map((r) => r.course)).size} courses` : "No chapters assigned this week."}</div>
    </div>`;
  h += `<div class="stat"><span class="lbl">Behind from earlier</span>
      <b class="${behind.length ? "" : ""}" style="${behind.length ? "color:var(--hot)" : ""}">${behind.length}</b>
      <div class="sub2">${behind.length
        ? `chapter${behind.length === 1 ? "" : "s"} not yet read — <a href="#backlog">see the backlog</a>`
        : "Nothing outstanding."}</div></div>`;
  h += nextCrunch
    ? `<div class="stat"><span class="lbl">Heaviest week ahead</span>
        <b>Week ${nextCrunch.w} · ${nextCrunch.load}%</b>
        <div class="track" style="height:10px;margin-top:5px">
          <div class="bars" style="--w:100">${nextCrunch.items.map((a) =>
            `<span class="seg" data-c="${esc(a.course)}" style="--v:${Number(a.weight_pct) || 1}"></span>`).join("")}</div></div>
        <div class="sub2">${fmtShort(weekMonday(nextCrunch.w))} · ${nextCrunch.items.length} item${nextCrunch.items.length === 1 ? "" : "s"} of your final grade</div></div>`
    : `<div class="stat"><span class="lbl">Heaviest week ahead</span><b>—</b>
        <div class="sub2">Nothing graded left in the term.</div></div>`;
  h += `</div>`;

  /* ---- 2. the term, in one strip ------------------------------------- */
  const maxLoad = Math.max(...loadByWeek.map((x) => x.load), 1);
  h += `<div style="margin-top:12px"><span class="lbl">The term at a glance — click a week</span>
    <div class="termstrip" style="margin-top:5px">`;
  for (const x of loadByWeek) {
    const isBreak = x.isBreak;
    const cls = [isBreak ? "break" : "", x.w === nowWk ? "now" : "", x.w < nowWk ? "past" : ""].filter(Boolean).join(" ");
    const label = isBreak
      ? `Week ${x.w}, ${fmt(weekMonday(x.w))}: study week, nothing due`
      : `Week ${x.w}, ${fmt(weekMonday(x.w))}: ${x.load ? `${x.load}% of your final grade due — ${x.items.map((a) => `${a.course} ${a.name} ${a.weight_pct}%`).join("; ")}` : "nothing due"}`;
    h += `<a class="tsc ${cls}" href="#week/${x.w}" style="--i:${isBreak ? 0 : (x.load / maxLoad).toFixed(3)}"
      title="${esc(label)}" aria-label="${esc(label)}"><span class="fill"></span>
      <span class="n">${x.w}</span><span class="wl">${fmtShort(weekMonday(x.w))}</span></a>`;
  }
  h += `</div></div></div>`;

  /* ---- 3. which week am I looking at --------------------------------- */
  h += `<div class="panel" style="padding:9px 14px"><div class="spread">
      <div class="row">
        <button id="wk-prev" class="ghost" ${wk <= 1 ? "disabled" : ""} title="Previous week ( [ )">‹ ${wk > 1 ? "week " + (wk - 1) : "week"}</button>
        <b style="font-family:var(--serif);font-size:17px">Week ${wk} of ${last}</b>
        <span class="quiet">${fmt(weekMonday(wk))} – ${fmt(plus(weekMonday(wk), 6))}</span>
        ${wk !== nowWk ? `<button id="wk-today" class="ghost">back to this week</button>` : `<span class="tag ok">this week</span>`}
        <button id="wk-next" class="ghost" ${wk >= last ? "disabled" : ""} title="Next week ( ] )">${wk < last ? "week " + (wk + 1) : "week"} ›</button>
      </div>
      ${holidayNote(wk)}
    </div></div>`;

  /* ---- 4. overdue, before anything else ------------------------------ */
  const over = dueSorted().filter((a) => isOverdue(a) && !gradeMap()[a.id]?.earned_pct);
  if (over.length) {
    h += `<div class="callout hot"><span class="lbl">Past its date — ${over.length} item${over.length === 1 ? "" : "s"}</span>
      <ul>${over.map((a) => `<li><b>${esc(a.course)} ${esc(a.name)}</b> · ${a.weight_pct}% · ${whenLabel(a)}
        <span class="tag overdue">${Math.abs(dMax(a))}d ago</span></li>`).join("")}</ul>
      <div class="quiet">If one of these is marked and returned, enter the mark in Courses and it stops showing here.</div></div>`;
  }

  /* ---- 5. the week band: items the syllabus dates only to a week ----- */
  const band = D.assessments.filter((a) => a.week_no === wk && a.date_precision !== "exact");
  if (band.length) {
    h += `<div class="weekband"><span class="lbl">The syllabus gives a week, not a day</span>
      ${band.map((a) => `<div class="wbrow">${pill(a.course)}
        <span class="tag ${esc(a.type)}">${esc(a.type)}</span>
        <b>${esc(a.name)}</b><span class="weight" style="font-weight:600">${a.weight_pct ? a.weight_pct + "%" : ""}</span>
        <div class="quiet" style="flex:1 1 100%">${esc(a.due_date_raw)}${a.note ? " — " + esc(a.note) : ""}</div>
      </div>`).join("")}
      <div class="quiet" style="margin-top:6px">Filing these on a Monday would be a guess. Confirm the day in class, then
        correct <code>data/assessments.csv</code> and note who told you in <code>data/changes.md</code>.</div></div>`;
  }

  /* ---- 6. readings beside a sticky rail of what is due --------------- */
  h += `<div class="weekgrid"><div>`;
  h += `<div class="panel"><h2>Readings for week ${wk}
    <span class="muted">${doneReads} of ${weekReads.length} done</span></h2>`;
  if (!weekReads.length) {
    h += `<div class="empty"><p>No chapter readings are assigned for week ${wk}.</p></div>`;
  } else {
    const byCourse = {};
    weekReads.forEach((r) => (byCourse[r.course] ||= []).push(r));
    for (const code of Object.keys(byCourse).sort()) {
      const rows = byCourse[code];
      const doneN = rows.filter((r) => isDone(prog, r.id)).length;
      h += `<div data-c="${esc(code)}" style="margin-bottom:10px">
        <div class="spread"><h3 style="margin:0">${courseTag(code)}</h3>
          <div class="row" style="gap:7px">
            <span class="quiet">${doneN}/${rows.length}</span>
            <button class="ghost" data-master="${rows.map((r) => esc(r.id)).join(",")}"
              data-to="${doneN === rows.length ? "not_started" : "done"}">${doneN === rows.length ? "clear all" : "all done"}</button>
          </div></div>`;
      h += meetingBlocks(code, rows, prog);
      h += `</div>`;
    }
  }
  h += `</div></div>`;

  /* the rail */
  h += `<div class="rail"><div class="panel"><div class="spread"><h2 style="margin:0">Due next</h2>
    <button class="ghost" id="sortdue" aria-pressed="${state.sortDueByWeight}">${state.sortDueByWeight ? "by weight" : "by date"}</button>
  </div>`;
  const buckets = [
    ["Today, or already this week", (n) => n === 0, "Nothing due today."],
    ["Next 7 days", (n) => n >= 1 && n <= 7, "Nothing in the next seven days."],
    ["Days 8 to 14", (n) => n >= 8 && n <= 14, "Nothing in the second week."],
  ];
  for (const [label, test, none] of buckets) {
    let items = dueSorted().filter((a) => !isOverdue(a) && test(daysLeft(a)));
    if (state.sortDueByWeight) items = items.slice().sort((a, b) => Number(b.weight_pct || 0) - Number(a.weight_pct || 0));
    h += `<div class="bucket"><span class="lbl">${label} <span class="n">${items.length || ""}</span></span>`;
    h += items.length ? items.map(dueRow).join("") : `<div class="quiet" style="padding:6px 0">${none}</div>`;
    h += `</div>`;
  }
  h += `</div>`;

  const starting = dueSorted().filter((a) => {
    const s = startBy(a);
    return s && s <= today() && !isOverdue(a) && Number(a.weight_pct || 0) >= 10;
  });
  if (starting.length) {
    h += `<div class="panel"><h2>Start now</h2>
      <p class="quiet">Counted back from the due date. An exam is not a thing you do on the day.</p>
      ${starting.map((a) => `<div class="due"><div class="when">${a.weight_pct}%<span class="abs">${relLabel(a)}</span></div>
        <div class="body">${pill(a.course)} <b>${esc(a.name)}</b>
          <div class="quiet">due ${whenLabel(a)}</div></div></div>`).join("")}</div>`;
  }
  h += `</div></div>`;

  /* ---- 7. the backlog, quiet and last ------------------------------- */
  h += `<div class="panel" id="backlog"><h2>Not yet read from earlier weeks
    <span class="muted">${behind.length} chapter${behind.length === 1 ? "" : "s"}</span></h2>`;
  if (!behind.length) {
    h += `<div class="empty"><p>Nothing outstanding — you are level with week ${nowWk}.</p></div>`;
  } else {
    const bc = {};
    behind.forEach((r) => (bc[r.course] ||= []).push(r));
    h += `<details open><summary>${Object.keys(bc).length} course${Object.keys(bc).length === 1 ? "" : "s"} with outstanding chapters</summary>
      <div class="cols tight" style="margin-top:9px">`;
    for (const code of Object.keys(bc).sort()) {
      h += `<div data-c="${esc(code)}"><div class="spread"><h3 style="margin:0">${courseTag(code)}</h3>
        <span class="quiet">${bc[code].length} behind</span></div>
        <div class="chips" style="margin-top:5px">${bc[code].map((r) => chapterChip(r, prog[r.id], true)).join("")}</div></div>`;
    }
    h += `</div></details>`;
  }
  h += `</div>`;
  return h;
};

function holidayNote(wk) {
  const mon = weekMonday(wk);
  const hit = Object.keys(D.term.holidays).filter((d) => d >= mon && d <= plus(mon, 6));
  const sw = D.term.study_week[0] >= mon && D.term.study_week[0] <= plus(mon, 6);
  const bits = hit.map((d) => `${D.term.holidays[d]} on ${fmt(d)}`);
  if (sw) bits.push("study week — no classes");
  if (D.term.drop_deadline >= mon && D.term.drop_deadline <= plus(mon, 6))
    bits.push(`${D.term.drop_deadline_label} on ${fmt(D.term.drop_deadline)}`);
  return bits.length ? `<span class="tag warn">${esc(bits.join(" · "))}</span>` : "";
}

/* One block per class MEETING: the topic belongs to the meeting, not to each
   chapter, so it is printed once instead of once per chapter. */
function meetingBlocks(code, rows, prog) {
  const byMeeting = {};
  rows.forEach((r) => (byMeeting[r.schedule_id] ||= []).push(r));
  const ids = Object.keys(byMeeting).sort((a, b) => {
    const ra = D.schedule.find((x) => x.id === a), rb = D.schedule.find((x) => x.id === b);
    return (ra?.class_date || "").localeCompare(rb?.class_date || "");
  });
  return ids.map((id) => {
    const row = D.schedule.find((x) => x.id === id) || {};
    const chs = byMeeting[id];
    return `<div class="meet">
      <div class="mhead"><span class="mdate">${fmt(row.class_date)}</span>
        ${row.due_item ? `<span class="tag ${esc(row.due_type)}">${esc(row.due_item)}</span>` : ""}
        ${row.confidence && row.confidence !== "high" ? `<span class="tag unstated" title="${esc(row.note || "")}">check this row</span>` : ""}
      </div>
      ${row.topic ? `<div class="topic">${esc(row.topic)}</div>` : ""}
      <div class="chips">${chs.map((r) => chapterChip(r, prog[r.id])).join("")}</div>
      ${row.note ? `<div class="quiet" style="margin-top:5px">${esc(row.note)}</div>` : ""}
    </div>`;
  }).join("");
}

/* One chapter = one chip = one hit target, tick included. */
function chapterChip(r, p, showWeek) {
  const s = p?.status || "";
  const glyph = s === "done" ? "✓" : "";
  const list = (s) => String(s || "").split(";").filter(Boolean).join(", ");
  const pages = r.pages ? `<span class="pg">pp. ${esc(list(r.pages))}</span>`
    : r.all_pages ? `<span class="pg" title="The syllabus lists these page ranges for the whole class without saying which chapter each belongs to">class pp. ${esc(list(r.all_pages))}</span>` : "";
  const label = `Chapter ${r.chapter}${r.pages ? `, pages ${list(r.pages)}` : ""} — ${s === "done" ? "done" : s === "in_progress" ? "in progress" : "not started"}`;
  return `<button class="chch" data-s="${esc(s)}" data-reading="${esc(r.id)}"
    aria-label="${esc(label)}" title="not started → in progress → done">
    <span class="box">${glyph}</span><span class="lab">ch ${esc(r.chapter)}</span>${pages}${showWeek ? `<span class="pg">wk ${r.week_no}</span>` : ""}</button>`;
}

function dueRow(a) {
  const heavy = Number(a.weight_pct || 0) >= 20;
  return `<div class="due ${urgencyClass(a)} ${heavy ? "heavy" : ""}" data-c="${esc(a.course)}">
    <div class="when">${relLabel(a)}<span class="abs">${a.date_precision === "exact" ? fmtShort(a.due_resolved) : "wk " + fmtShort(a.due_resolved)}</span></div>
    <div class="body">${pill(a.course)}
      <span class="tag ${esc(a.type)}">${esc(a.type)}</span>
      <b>${esc(a.name)}</b>
      ${a.scope_chapters ? `<div class="quiet">covers ch. ${esc(a.scope_chapters.replace(/;/g, ", "))}</div>` : ""}
      ${a.materials_allowed ? `<div class="quiet">${esc(a.materials_allowed)}</div>` : ""}
    </div>
    <div class="weight">${a.weight_pct ? a.weight_pct + "%" : "—"}</div>
  </div>`;
}

/* ==================================================================== GRID */
VIEWS.grid = () => {
  const codes = D.courses.map((c) => c.code);
  const nowWk = clampWeek(termWeek(today()));
  const last = LAST_WEEK();
  const compact = LS.get("beagle-density") === "compact";

  let h = `<div class="panel"><div class="spread"><h2 style="margin:0">Term grid
      <span class="muted">every week, every course</span></h2>
    <button class="ghost" id="density" aria-pressed="${compact}">${compact ? "showing deadlines only" : "show deadlines only"}</button></div>
    <p class="quiet">Chapters and deadlines by week. Study week and the holidays get their own rows, and the
      current week is ruled in the accent colour. An em dash means a class with nothing assigned; a hatched cell
      means that course has no class at all that week. Click a course code to open it.</p>
    <div class="scroll"><table class="grid"><thead><tr><th class="wkh" scope="col">Week</th>`;
  h += codes.map((c) => `<th scope="col" data-c="${esc(c)}">
      <a class="gridcode" href="#courses/${esc(c)}" style="text-decoration:none">${esc(c)}</a>
      <span class="gridtitle">${esc(courseName(c))}</span></th>`).join("") + `</tr></thead><tbody>`;

  for (let w = 1; w <= last; w++) {
    const mon = weekMonday(w);
    const landmarks = [];
    Object.keys(D.term.holidays).forEach((d) => {
      if (d >= mon && d <= plus(mon, 6)) landmarks.push(`${D.term.holidays[d]} — ${fmt(d)}`);
    });
    if (D.term.drop_deadline >= mon && D.term.drop_deadline <= plus(mon, 6))
      landmarks.push(`${D.term.drop_deadline_label} — ${fmt(D.term.drop_deadline)}`);
    if (D.term.grades_released >= mon && D.term.grades_released <= plus(mon, 6))
      landmarks.push(`Grades released — ${fmt(D.term.grades_released)}`);

    h += `<tr class="${w === nowWk ? "now" : ""}"><th class="wk" scope="row">${w}<span class="mini muted">${fmtShort(mon)}</span></th>`;
    for (const code of codes) {
      const rows = D.schedule.filter((r) => r.course === code && r.week_no === w);
      /* Say "no class" rather than leaving the cell blank. It is only two
         cells of 120 (LGL152 and LGL153 both finish in week 14), but an empty
         cell and a missing row look identical, which is the one failure mode
         this project cannot afford. */
      if (!rows.length) { h += `<td class="off"><span class="quiet">no class</span></td>`; continue; }
      if (rows.every((r) => r.due_type === "study_week")) { h += `<td class="break">study week</td>`; continue; }

      /* Chapters come from the DERIVED readings, so an exam's scope is not
         shown as reading newly assigned that week. */
      const chapters = [...new Set(D.readings.filter((r) => r.course === code && r.week_no === w).map((r) => r.chapter))];
      const dues = D.assessments.filter((a) => a.course === code && a.week_no === w);
      let cell = "";
      if (chapters.length) cell += `<span class="ch">ch ${chapters.join(", ")}</span>`;
      for (const a of dues) {
        cell += `<span class="mini"><span class="tag ${esc(a.type)}">${esc(a.name)}${a.weight_pct ? " " + a.weight_pct + "%" : ""}</span>`;
        if (a.scope_chapters) cell += `<span class="cov">covers ch ${esc(a.scope_chapters.replace(/;/g, ", "))}</span>`;
        cell += `</span>`;
      }
      if (!cell) cell = `<span class="muted">—</span>`;
      h += `<td>${cell}</td>`;
    }
    h += `</tr>`;
    if (landmarks.length) h += `<tr class="landmark"><td colspan="${codes.length + 1}">${esc(landmarks.join("  ·  "))}</td></tr>`;
  }
  h += `</tbody></table></div>`;
  h += legend();
  h += `</div>`;
  return h;
};

function legend() {
  return `<div class="legend">${D.courses.map((c) =>
    `<a href="#courses/${esc(c.code)}" data-c="${esc(c.code)}" title="${esc(c.name)}">
      <span class="dot"></span><span class="code">${esc(c.code)}</span></a>`).join("")}</div>`;
}

/* ================================================================== CRUNCH */
function crunchWeeks() {
  const last = LAST_WEEK();
  const out = [];
  for (let w = 1; w <= last; w++) {
    const items = D.assessments.filter((a) => a.week_no === w);
    const rows = D.schedule.filter((r) => r.week_no === w);
    out.push({
      w, items,
      load: items.reduce((s, a) => s + Number(a.weight_pct || 0), 0),
      chapters: D.readings.filter((r) => r.week_no === w).length,
      heavy: items.filter((a) => Number(a.weight_pct || 0) >= 20).length,
      isBreak: rows.length > 0 && rows.every((r) => r.due_type === "study_week"),
    });
  }
  return out;
}

VIEWS.crunch = () => {
  const weeks = crunchWeeks();
  const nowWk = clampWeek(termWeek(today()));
  const max = Math.max(...weeks.map((x) => x.load), 1);
  const ranked = weeks.slice().filter((x) => x.load).sort((a, b) => b.load - a.load);
  const twoHeavy = weeks.filter((x) => x.heavy >= 2);
  const free = weeks.filter((x) => !x.load && !x.isBreak);
  /* Per course, the weights must account for 100%. A course that does not is
     telling you a component was missed when the syllabus was read — it is the
     cheapest integrity check in the project, so it is stated, not hidden. */
  const bad = D.courses.map((c) => c.code).filter((code) => Math.abs(
    D.assessments.filter((a) => a.course === code)
      .reduce((s, a) => s + Number(a.weight_pct || 0), 0) - 100) > 0.5);
  const allSum = bad.length === 0;
  const flat = (100 / weeks.filter((x) => !x.isBreak).length);

  let h = `<div class="panel"><h2>Crunch radar</h2>`;
  /* A chart that needs interpreting has not answered the question. */
  h += `<p style="font-family:var(--serif);font-size:18px;line-height:1.45;max-width:52ch">
    Your hardest weeks are <b>${ranked.slice(0, 3).map((x) => `week ${x.w} (${x.load}%)`).join(", ")}</b>.
    An even spread would be about ${flat.toFixed(1)}% a week.</p>`;
  h += `<p class="quiet">Each professor sees only their own course. This is the one view nobody else can produce for
    you: a week where three courses independently set a midterm looks reasonable on every syllabus and impossible
    from your side of the desk. Measured in percent of your final grade — never in hours, because five of the eight
    syllabi give chapter numbers with no page counts, so any hours figure would be invented.</p>`;

  h += `<div class="cmd" style="margin-top:12px">
    <div class="stat"><span class="lbl">Heaviest week</span><b>${ranked[0].load}%</b>
      <div class="sub2">week ${ranked[0].w}, ${fmtShort(weekMonday(ranked[0].w))}</div></div>
    <div class="stat"><span class="lbl">Weeks with two big items</span><b>${twoHeavy.length}</b>
      <div class="sub2">two or more worth 20% or more</div></div>
    <div class="stat"><span class="lbl">Weeks with nothing due</span><b>${free.length}</b>
      <div class="sub2">of ${weeks.length} — the rest of the term carries weight</div></div>
    <div class="stat"><span class="lbl">Weights accounted for</span>
      <b>${allSum ? "100%" : "check"}</b>
      <div class="sub2">${allSum
        ? `every course adds up, across ${D.assessments.length} items`
        : `these courses do not add up: ${bad.join(", ")}`}</div></div>
  </div>`;

  if (twoHeavy.length) {
    h += `<div class="callout hot" style="margin-top:12px"><span class="lbl">Weeks carrying two or more items worth 20% or more</span>
      <div class="wklist">${twoHeavy.map((x) => `<div class="wkitem">
        <span class="wkname"><b>Week ${x.w}</b> · ${fmtShort(weekMonday(x.w))} · <b>${x.load}%</b></span>
        <span class="chips">${x.items.filter((a) => Number(a.weight_pct || 0) >= 20)
          .map((a) => `<span class="tag ${esc(a.type)}" data-c="${esc(a.course)}">${esc(a.course)} ${esc(a.name)} ${a.weight_pct}%</span>`).join("")}</span>
      </div>`).join("")}</div></div>`;
  }
  h += `</div>`;

  /* the chart */
  h += `<div class="panel"><h2>Grade falling due, week by week</h2>
    <p class="quiet">Each bar is one week; each segment is one course, sized by its weight. The dashed line is an even spread.</p>`;
  for (const x of weeks) {
    const mon = weekMonday(x.w);
    h += `<div class="stackbar ${x.w === nowWk ? "now" : ""} ${x.isBreak ? "break" : ""}">
      <div class="wkl">Week ${x.w}<small>${fmtShort(mon)}</small></div>
      <div class="track" title="${esc(x.isBreak ? "Study week" : x.load ? x.items.map((a) => `${a.course} ${a.name} ${a.weight_pct}%`).join("; ") : "nothing due")}">
        <div class="flat" style="--flat:${(flat / max * 100).toFixed(2)}%"></div>
        <div class="bars" style="--w:${(x.load / max * 100).toFixed(2)}">${x.items.map((a) =>
          `<span class="seg" data-c="${esc(a.course)}" style="--v:${Number(a.weight_pct) || 1}"
            title="${esc(a.course + " " + a.name + " " + a.weight_pct + "%")}"></span>`).join("")}</div>
      </div>
      <div class="pc ${x.load >= 50 ? "hot" : x.load >= 25 ? "warn" : ""}">${x.load ? x.load + "%" : x.isBreak ? "—" : "0"}</div>
    </div>`;
    const marks = [];
    Object.keys(D.term.holidays).forEach((d) => { if (d >= mon && d <= plus(mon, 6)) marks.push(`${D.term.holidays[d]}, ${fmt(d)}`); });
    if (D.term.drop_deadline >= mon && D.term.drop_deadline <= plus(mon, 6)) marks.push(`${D.term.drop_deadline_label}, ${fmt(D.term.drop_deadline)}`);
    if (marks.length) h += `<div class="lmk"><div></div><div class="txt">${esc(marks.join(" · "))}</div></div>`;
  }
  h += legend();
  h += `</div>`;

  /* the table, compact */
  h += `<div class="panel"><h2>The same term as a table</h2><div class="scroll"><table class="rtable">
    <thead><tr><th scope="col">Week</th><th scope="col">Starting</th><th scope="col" class="num">Grade due</th>
      <th scope="col" class="num">Chapters</th><th scope="col">Items</th></tr></thead><tbody>`;
  for (const x of weeks) {
    h += `<tr class="${x.w === nowWk ? "now" : ""}" ${x.w === nowWk ? 'style="background:var(--now-bg)"' : ""}>
      <td class="nowrap"><b><a href="#grid" style="text-decoration:none">Week ${x.w}</a></b>${ranked.slice(0, 3).some((r) => r.w === x.w) ? ' <span class="tag hot">peak</span>' : ""}${x.w === nowWk ? ' <span class="tag">now</span>' : ""}</td>
      <td class="nowrap" data-label="Starting">${fmtShort(weekMonday(x.w))}</td>
      <td class="num" data-label="Grade due">${x.load ? x.load + "%" : "—"}</td>
      <td class="num" data-label="Chapters">${x.chapters || "—"}</td>
      <td data-label="Items">${x.items.length
        ? `<div class="chips">${x.items.map((a) => `<span class="tag ${esc(a.type)}" data-c="${esc(a.course)}"
            title="${esc(courseName(a.course))}">${esc(a.course)} ${esc(a.name)}${a.weight_pct ? " " + a.weight_pct + "%" : ""}</span>`).join("")}</div>`
        : x.isBreak ? '<span class="tag study_week">study week</span>' : '<span class="muted">—</span>'}</td>
    </tr>`;
  }
  h += `</tbody></table></div></div>`;
  return h;
};

/* =================================================================== EXAMS */
VIEWS.exams = () => {
  const items = dueSorted().filter((a) => ["exam", "test", "quiz"].includes(a.type));
  const stated = items.filter((a) => a.scope_source === "stated");
  const unstated = items.filter((a) => a.scope_source !== "stated");
  const nextUp = items.find((a) => !isOverdue(a));

  let h = `<div class="panel"><h2>Exams, tests and quizzes <span class="muted">what each one actually covers</span></h2>
    <p class="quiet">Scope is shown only where the syllabus states it. Where it does not, this says so rather than
      guessing — and the difference matters, because the courses that <b>do</b> state scope disagree with each other.</p>
    <div class="callout"><span class="lbl">On whether your exams are cumulative</span>
      <ul>
        <li><b>${stated.length} of ${items.length}</b> name their chapters.</li>
        <li><b>LGL153</b> splits cleanly with no overlap: 1–4, then 5–7, then 8–10.</li>
        <li><b>LGL152</b> Test #2 re-covers chapters 11–12 from Test #1.</li>
        <li><b>LGL225</b>'s final re-covers chapters 3 and 6 from its midterm, and skips 1, 2, 7 and 9 entirely.</li>
        <li>So: mostly forward-looking, but read each stated list literally instead of assuming “everything since the last one”.</li>
        <li>The other <b>${unstated.length}</b> state nothing. That is one email each, and the Review tab tracks them.</li>
      </ul></div></div>`;

  let lastMonth = "";
  for (const a of items) {
    const m = a.due_resolved ? MONTH_FULL[toDate(a.due_resolved).getMonth()] : "";
    if (m && m !== lastMonth) {
      h += `<div class="monthsep"><span class="lbl">${esc(m)}</span></div>`;
      lastMonth = m;
    }
    const inScope = a.scope_chapters
      ? D.schedule.filter((r) => r.course === a.course &&
          r.chapters.split(";").filter(Boolean).some((c) => a.scope_chapters.split(";").includes(c)))
      : [];
    h += `<div class="examcard ${a === nextUp ? "next" : ""}" data-c="${esc(a.course)}" id="exam-${esc(a.id)}">
      <div class="ehead">
        <h3>${pill(a.course)} <span class="tag ${esc(a.type)}">${esc(a.type)}</span> ${esc(a.name)}
          <span class="course-title stack">${esc(courseName(a.course))}</span></h3>
        <div class="ewhen">
          <span class="d">${a.weight_pct ? a.weight_pct + "%" : "—"}</span>
          ${whenLabel(a)}<br>
          <span class="quiet">${relLabel(a)}</span>
        </div>
      </div>
      <dl class="kv" style="margin-top:9px">
        <dt>Scope</dt><dd>${a.scope_chapters
          ? `<b>Chapters ${esc(a.scope_chapters.replace(/;/g, ", "))}</b> <span class="tag ok">stated in syllabus</span>`
          : `<span class="tag unstated">not stated — ask your professor</span>`}</dd>
        ${a.materials_allowed ? `<dt>Materials</dt><dd>${esc(a.materials_allowed)}</dd>` : ""}
        ${a.format ? `<dt>Format</dt><dd>${esc(a.format)}</dd>` : ""}
        ${a.duration ? `<dt>Duration</dt><dd>${esc(a.duration)}</dd>` : ""}
        ${inScope.length ? `<dt>Weeks to review</dt><dd>
          <details><summary>${inScope.length} class${inScope.length === 1 ? "" : "es"} covered this scope</summary>
          ${inScope.map((r) =>
            `<div class="rowline"><span class="quiet" style="flex:none;width:52px">${fmtShort(r.class_date)}</span>
              <span class="ch" style="flex:none">ch ${esc(r.chapters.replace(/;/g, ", "))}</span>
              <span class="quiet" style="flex:1 1 60%">${esc(r.topic)}</span></div>`).join("")}
          </details></dd>` : ""}
        ${a.note ? `<dt>Note</dt><dd>${esc(a.note)}</dd>` : ""}
      </dl>
      <details><summary>what the syllabus actually printed</summary>
        <div class="raw">${esc(a.due_date_raw)}</div></details>
    </div>`;
  }
  return h;
};

/* ================================================================= COURSES */
VIEWS.courses = () => {
  const code = state.course || D.courses[0].code;
  state.course = code;
  const c = course(code);
  const prog = progressMap();
  const gm = gradeMap();
  const items = D.assessments.filter((a) => a.course === code);

  const graded = items.filter((a) => gm[a.id]?.earned_pct !== undefined && gm[a.id]?.earned_pct !== "");
  const gradedWeight = graded.reduce((s, a) => s + Number(a.weight_pct || 0), 0);
  const banked = graded.reduce((s, a) => s + Number(a.weight_pct || 0) * Number(gm[a.id].earned_pct) / 100, 0);
  const remaining = 100 - gradedWeight;
  const standing = gradedWeight ? banked / gradedWeight * 100 : null;
  const needed = remaining > 0 ? (state.target - banked) / remaining * 100 : null;
  const weightSum = items.reduce((s, a) => s + Number(a.weight_pct || 0), 0);
  const reads = D.readings.filter((r) => r.course === code);
  const readDone = reads.filter((r) => isDone(prog, r.id)).length;
  const anyReturned = items.some((a) => gm[a.id]?.returned_date);

  let h = `<div class="panel" style="padding:10px 14px"><div class="row">
    <label for="csel" style="margin:0">Course</label>
    <select id="csel">${D.courses.map((x) =>
      `<option value="${esc(x.code)}" ${x.code === code ? "selected" : ""}>${esc(x.code)} — ${esc(x.name)}</option>`).join("")}</select>
    ${legend()}
  </div></div>`;

  h += `<div class="cols" data-c="${esc(code)}">
    <div class="panel"><h2>${courseTag(code)}</h2>
      <dl class="kv">
        <dt>Instructor</dt><dd>${c.instructor
          ? `${esc(c.instructor)}${c.email ? ` · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}`
          : `<span class="tag unstated">not named in syllabus</span>`}</dd>
        ${c.mode ? `<dt>Mode</dt><dd>${esc(c.mode)}</dd>` : ""}
        <dt>Meets</dt><dd>${c.meeting_days ? esc(c.meeting_days) : `<span class="tag unstated">not stated</span>`}</dd>
        <dt>Textbook</dt><dd>${c.textbook
          ? `${esc(c.textbook)}<div class="quiet">${esc(c.textbook_author)}${c.textbook_isbn ? " · ISBN " + esc(c.textbook_isbn) : ""}</div>`
          : `<span class="tag unstated">not named in syllabus</span>`}</dd>
        ${c.class_nbr ? `<dt>Class nbr</dt><dd>${esc(c.class_nbr)}${c.section ? " · section " + esc(c.section) : ""}</dd>` : ""}
        <dt>Reading</dt><dd>${reads.length ? `${readDone} of ${reads.length} chapters read
          <div class="bar ${readDone === reads.length ? "ok" : ""}" style="margin-top:4px"><i style="width:${reads.length ? readDone / reads.length * 100 : 0}%"></i></div>`
          : `<span class="tag unstated">no chapters listed</span>`}</dd>
      </dl>
      ${c.note ? `<div class="callout" style="margin-top:10px">${esc(c.note)}</div>` : ""}
    </div>

    <div class="panel"><h2>Standing</h2>
      <div class="cmd">
        <div class="stat"><span class="lbl">Graded so far</span><b>${gradedWeight}%</b>
          <div class="sub2">of the course marked</div></div>
        <div class="stat"><span class="lbl">Average on it</span>
          <b>${standing === null ? "—" : standing.toFixed(1) + "%"}</b>
          <div class="sub2">${standing === null ? "nothing marked yet" : `${banked.toFixed(1)} points banked`}</div></div>
        <div class="stat"><span class="lbl">Still to come</span><b>${remaining}%</b>
          <div class="sub2">${items.length - graded.length} item${items.length - graded.length === 1 ? "" : "s"} unmarked</div></div>
        ${gradedWeight > 0 ? `<div class="stat"><span class="lbl">Need on the rest</span>
          <b>${needed === null ? "—" : needed <= 0 ? "secured" : needed > 100 ? "out of reach" : needed.toFixed(1) + "%"}</b>
          <div class="sub2">${needed !== null && needed > 85 && needed <= 100 ? "steep — " : ""}to finish on ${state.target}%</div></div>`
        : `<div class="stat"><span class="lbl">Need on the rest</span><b>—</b>
          <div class="sub2">enter your first mark below and this fills in</div></div>`}
      </div>
      <div class="row" style="margin-top:10px"><label for="tgt" style="margin:0">Target</label>
        <input id="tgt" class="mark" type="number" min="0" max="100" value="${state.target}"> %</div>
      <p class="quiet" style="margin-top:8px">Seneca's drop-without-academic-penalty deadline is
        <b>${fmt(D.term.drop_deadline)}</b>, which is when this number matters most.</p>
    </div>
  </div>`;

  h += `<div class="panel"><h2>Assessments <span class="muted">${items.length} items · ${weightSum}% of the grade</span></h2>`;
  if (Math.abs(weightSum - 100) > 0.5) {
    h += `<div class="callout warn"><span class="lbl">These weights do not add up to 100%</span>
      ${weightSum}% is accounted for, so ${(100 - weightSum).toFixed(1)}% is missing. A component was probably
      missed when the syllabus was read. Check before you rely on the standing figures above.</div>`;
  }
  h += `<div class="scroll"><table class="rtable">
    <thead><tr><th scope="col">When</th><th scope="col">Item</th><th scope="col" class="num">Weight</th>
      <th scope="col">Scope</th><th scope="col" class="num">Mark</th>${anyReturned ? '<th scope="col">Returned</th>' : ""}</tr></thead><tbody>`;
  for (const a of items.slice().sort((x, y) => (x.due_resolved || "").localeCompare(y.due_resolved || ""))) {
    const g = gm[a.id] || {};
    h += `<tr>
      <td class="nowrap" data-label="When">${a.date_precision === "exact" ? fmt(a.due_resolved) : "wk of " + fmtShort(a.due_resolved)}</td>
      <td><span class="tag ${esc(a.type)}">${esc(a.type)}</span> <b>${esc(a.name)}</b>
        ${a.note ? `<details><summary>note</summary><div class="quiet">${esc(a.note)}</div></details>` : ""}</td>
      <td class="num" data-label="Weight">${a.weight_pct ? a.weight_pct + "%" : "—"}</td>
      <td data-label="Scope">${a.scope_chapters ? `<span class="ch">ch ${esc(a.scope_chapters.replace(/;/g, ", "))}</span>`
        : `<span class="tag unstated">ask</span>`}</td>
      <td class="num" data-label="Mark"><input class="mark" type="number" min="0" max="100" step="0.1"
        data-grade="${esc(a.id)}" value="${esc(g.earned_pct || "")}" placeholder="—"
        aria-label="Mark for ${esc(a.name)}, percent"></td>
      ${anyReturned ? `<td class="nowrap quiet" data-label="Returned">${esc(g.returned_date || "")}</td>` : ""}
    </tr>`;
  }
  h += `</tbody></table></div></div>`;

  h += `<div class="panel"><h2>Schedule and readings</h2><div class="scroll"><table class="rtable">
    <thead><tr><th scope="col" style="width:92px">Date</th><th scope="col" class="num">Wk</th>
      <th scope="col">Topic</th><th scope="col" style="width:260px">Readings</th><th scope="col">Due</th></tr></thead><tbody>`;
  for (const r of D.schedule.filter((x) => x.course === code)) {
    const isBreak = r.due_type === "study_week";
    const rd = D.readings.filter((x) => x.schedule_id === r.id);
    h += `<tr class="${r.week_no === clampWeek(termWeek(today())) ? "now" : ""}"
      ${r.week_no === clampWeek(termWeek(today())) ? 'style="background:var(--now-bg)"' : ""}>
      <td class="nowrap"><b>${fmt(r.class_date)}</b><span class="quiet nowk"> · week ${r.week_no}</span></td>
      <td class="num" data-label="Week">${r.week_no}</td>
      <td>${isBreak ? '<span class="tag study_week">study week</span>' : esc(r.topic)}
        ${r.note ? `<div class="quiet">${esc(r.note)}</div>` : ""}</td>
      <td data-label="Readings">${rd.length ? `<div class="chips">${rd.map((x) => chapterChip(x, prog[x.id])).join("")}</div>`
        : (r.reading_raw ? `<span class="quiet">${esc(r.reading_raw)}</span>` : '<span class="muted">—</span>')}</td>
      <td data-label="Due">${r.due_item ? `<span class="tag ${esc(r.due_type)}">${esc(r.due_item)}</span>` : ""}</td>
    </tr>`;
  }
  h += `</tbody></table></div>
    <p class="quiet">The verbatim syllabus wording is kept in <code>reading_raw</code> and <code>date_raw</code> in
    <code>data/schedule.csv</code>, so any figure here traces back to a page of the original PDF.</p></div>`;
  return h;
};

/* =================================================================== NOTES */
VIEWS.notes = () => {
  const byCourse = {};
  D.notes.forEach((n) => (byCourse[n.course || "—"] ||= []).push(n));
  const wk = clampWeek(termWeek(today()));
  const thisWeekRows = D.schedule.filter((r) => r.week_no === wk && r.due_type !== "study_week");

  let h = `<div class="panel"><h2>Reading notes <span class="muted">${D.notes.length} note${D.notes.length === 1 ? "" : "s"}</span></h2>
    <p class="quiet">Plain Markdown under <code>notes/&lt;COURSE&gt;/</code>. Write them here or in any editor — this
      only indexes and renders them, so your notes are never trapped in this app.</p>
    <div class="row">
      <select id="newnote-course" aria-label="Course for the new note">${D.courses.map((c) =>
        `<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.name)}</option>`).join("")}</select>
      <select id="newnote-row" aria-label="Class meeting to base the note on">
        <option value="">— blank note —</option>
        ${D.courses.map((c) => {
          const rows = D.schedule.filter((r) => r.course === c.code && r.due_type !== "study_week");
          if (!rows.length) return "";
          return `<optgroup label="${esc(c.code)} — ${esc(c.name)}">${rows.map((r) =>
            `<option value="${esc(r.id)}" ${thisWeekRows.some((t) => t.id === r.id) && r.course === D.courses[0].code ? "" : ""}>${fmtShort(r.class_date)} · wk ${r.week_no} · ${esc(r.topic.slice(0, 60))}</option>`).join("")}</optgroup>`;
        }).join("")}
      </select>
      <button id="newnote">+ New note</button>
    </div></div>`;

  if (!D.notes.length) {
    h += `<div class="panel"><div class="empty">
      <h3>No notes yet</h3>
      <p>Pick a class meeting above and press <b>New note</b>. The template opens with Rule, Elements,
        Exceptions, Cases and Questions for the professor — the shape you will want in November.</p>
    </div></div>`;
    return h;
  }

  h += `<div class="notelayout"><div class="panel notelist">`;
  for (const code of Object.keys(byCourse).sort()) {
    h += `<div class="grp" data-c="${esc(code)}">${esc(code)}<span class="grptitle">${esc(courseName(code))}</span></div>`;
    h += byCourse[code].sort((a, b) => (b.week_of || "").localeCompare(a.week_of || ""))
      .map((n) => `<a href="#" data-note="${esc(n.path)}" class="${n.path === state.notePath ? "on" : ""}">
        ${esc(n.title)}<div class="quiet">${n.week_of ? fmtShort(n.week_of) + " · " : ""}${n.words} words</div></a>`).join("");
  }
  h += `</div><div class="panel" id="notepane">`;
  h += state.notePath
    ? `<p class="muted">loading ${esc(state.notePath)}…</p>`
    : `<div class="empty"><h3>Pick a note</h3><p>Or create one from a class meeting above.</p></div>`;
  h += `</div></div>`;
  return h;
};

async function openNote(path) {
  state.notePath = path;
  render();
  const r = await fetch("/api/note?path=" + encodeURIComponent(path));
  const j = await r.json();
  const pane = $("#notepane");
  if (!pane) return;
  pane.innerHTML = `<div class="spread">
      <h2>${esc(path)}</h2>
      <div class="row">
        <button id="note-edit">Edit</button>
        <button id="note-open" class="ghost">Open in editor</button>
      </div>
    </div><div class="md" id="noterender">${md(j.text)}</div>`;
  $("#note-edit").onclick = () => {
    pane.innerHTML = `<div class="spread"><h2>${esc(path)}</h2>
        <div class="row"><button id="note-save">Save</button>
        <button id="note-cancel" class="ghost">Cancel</button></div></div>
      <textarea id="noteedit" aria-label="Note source">${esc(j.text)}</textarea>`;
    $("#note-save").onclick = async () => {
      await post("/api/note", { path, text: $("#noteedit").value });
      await load();
      openNote(path);
    };
    $("#note-cancel").onclick = () => openNote(path);
  };
  $("#note-open").onclick = () => post("/api/open", { path: "notes/" + path });
}

/* Minimal Markdown: headings, bold, italic, code, links, lists, quotes, rules. */
function md(src) {
  const lines = String(src).replace(/\r/g, "").split("\n");
  let out = [], inCode = false, listType = null;
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|\W)\*([^*]+)\*/g, "$1<i>$2</i>")
    .replace(/\[\[([^\]]+)\]\]/g, '<a href="#" class="quiet">[[$1]]</a>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };

  for (let raw of lines) {
    if (/^```/.test(raw)) { closeList(); out.push(inCode ? "</pre>" : "<pre>"); inCode = !inCode; continue; }
    if (inCode) { out.push(esc(raw)); continue; }
    if (/^---+\s*$/.test(raw)) { closeList(); out.push("<hr>"); continue; }
    let m;
    if ((m = raw.match(/^(#{1,4})\s+(.*)$/))) {
      closeList(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue;
    }
    if ((m = raw.match(/^\s*[-*]\s+(.*)$/))) {
      if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; }
      out.push(`<li>${inline(m[1])}</li>`); continue;
    }
    if ((m = raw.match(/^\s*\d+[.)]\s+(.*)$/))) {
      if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; }
      out.push(`<li>${inline(m[1])}</li>`); continue;
    }
    if ((m = raw.match(/^>\s?(.*)$/))) { closeList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    if (!raw.trim()) { closeList(); continue; }
    closeList();
    out.push(`<p>${inline(raw)}</p>`);
  }
  closeList();
  if (inCode) out.push("</pre>");
  return out.join("\n");
}

/* =================================================================== CASES */
VIEWS.cases = () => {
  let h = `<div class="panel"><h2>Case briefs <span class="muted">${D.cases.length} case${D.cases.length === 1 ? "" : "s"}</span></h2>
    <p class="quiet">LGL151, LGL152 and LGL250 all assign heavy case reading. Cite to the <b>McGill Guide</b>
      (Canadian Guide to Uniform Legal Citation), not Bluebook — the habit is cheaper to build now than to
      unlearn. <b>Verified</b> means you have opened the decision yourself on CanLII: nothing goes into graded
      work until that column says yes.</p>
    <div class="cols tight" style="margin-top:10px">
      <div class="field"><label for="c-style">Style of cause</label>
        <input id="c-style" placeholder="Jones v Tsige" style="width:100%"></div>
      <div class="field"><label for="c-cite">Citation</label>
        <input id="c-cite" placeholder="2012 ONCA 32" style="width:100%"></div>
      <div class="field"><label for="c-url">CanLII URL</label>
        <input id="c-url" placeholder="https://canlii.ca/t/..." style="width:100%"></div>
      <div class="field"><label for="c-course">Course</label>
        <select id="c-course" style="width:100%">${D.courses.map((c) => `<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.name)}</option>`).join("")}</select></div>
    </div>
    <button id="c-add">+ Add case</button></div>`;

  if (!D.cases.length) {
    h += `<div class="panel"><div class="empty"><h3>No cases yet</h3>
      <p>Add the first one you are assigned. Style of cause is the only required field — citation and CanLII link
        can follow once you have looked the decision up.</p></div></div>`;
    return h;
  }

  h += `<div class="panel"><div class="scroll"><table class="rtable">
    <thead><tr><th scope="col">Style of cause</th><th scope="col">Citation</th><th scope="col">Course</th>
      <th scope="col">Status</th><th scope="col">Verified</th><th scope="col"></th></tr></thead><tbody>`;
  for (const c of D.cases) {
    h += `<tr data-c="${esc(c.course)}">
      <td>${c.canlii_url ? `<a href="${esc(c.canlii_url)}" target="_blank" rel="noreferrer">${esc(c.style_of_cause)}</a>` : esc(c.style_of_cause)}</td>
      <td class="raw" data-label="Citation">${esc(c.citation)}</td>
      <td data-label="Course">${pill(c.course)}</td>
      <td data-label="Status"><select data-case-status="${esc(c.id)}" aria-label="Status">${["stub", "drafted", "reviewed", "exam-ready"]
        .map((s) => `<option ${c.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
      <td data-label="Verified"><input type="checkbox" data-case-verified="${esc(c.id)}" ${c.verified === "yes" ? "checked" : ""}
        aria-label="Verified on CanLII"></td>
      <td><button class="ghost" data-case-del="${esc(c.id)}" aria-label="Delete case">×</button></td>
    </tr>`;
  }
  h += `</tbody></table></div></div>`;
  return h;
};

/* ================================================================== REVIEW */
function reviewItems() {
  const out = [];
  const FLAG = /confirm|unconfirmed|clash|check|ask|closed|before this row|previous week/i;

  for (const a of D.assessments) {
    if (["exam", "test"].includes(a.type) && a.scope_source !== "stated") {
      out.push({ kind: "Exam scope not stated", who: `${a.course} ${a.name}`, sub: courseName(a.course),
        code: a.course, weight: a.weight_pct, when: a.due_resolved, what: "", raw: a.due_date_raw });
    }
    if (a.confidence && a.confidence !== "high") {
      out.push({ kind: "Low confidence", who: `${a.course} ${a.name}`, sub: courseName(a.course),
        code: a.course, weight: a.weight_pct, when: a.due_resolved, what: a.note, raw: a.due_date_raw });
    } else if (a.note && FLAG.test(a.note)) {
      out.push({ kind: "Worth confirming", who: `${a.course} ${a.name}`, sub: courseName(a.course),
        code: a.course, weight: a.weight_pct, when: a.due_resolved, what: a.note, raw: a.due_date_raw });
    }
  }
  for (const r of D.schedule) {
    if ((r.confidence && r.confidence !== "high") || (r.note && FLAG.test(r.note))) {
      out.push({ kind: "Schedule row", who: `${r.course} ${fmtShort(r.class_date)}`, sub: courseName(r.course),
        code: r.course, weight: "", when: r.class_date, what: r.note, raw: r.date_raw });
    }
  }
  /* Course-level rows have no item of their own — the course IS the item, so
     the name goes in the item column and the pill carries the code. */
  for (const c of D.courses) {
    if (c.note && FLAG.test(c.note))
      out.push({ kind: "Course detail", who: c.name, sub: "", code: c.code, weight: "", when: "", what: c.note, raw: "" });
    if (!c.textbook)
      out.push({ kind: "Textbook not named", who: c.name, sub: "", code: c.code, weight: "", when: "", what: "", raw: "" });
    if (!c.instructor)
      out.push({ kind: "Instructor not named", who: c.name, sub: "", code: c.code, weight: "", when: "", what: "", raw: "" });
  }
  return out;
}

/* The shared explanation is printed once per group, not once per row — it was
   the same sentence eleven times under "Exam scope not stated". */
const GROUP_NOTE = {
  "Exam scope not stated": "None of these syllabi say which chapters the assessment covers. One email to each professor settles the lot.",
  "Textbook not named": "The syllabus cites chapter numbers but never names the book. Check Blackboard or the Seneca bookstore before buying anything.",
  "Instructor not named": "No instructor is named in the syllabus.",
  "Low confidence": "The extractor could not read these rows cleanly. Check them against the PDF.",
  "Worth confirming": "Each of these carries a note from the extraction worth putting to the professor.",
  "Schedule row": "Rows where the syllabus itself is odd, ambiguous or self-contradictory.",
  "Course detail": "Course-level facts worth confirming.",
};
const GROUP_ORDER = ["Worth confirming", "Low confidence", "Schedule row", "Exam scope not stated",
  "Textbook not named", "Instructor not named", "Course detail"];

VIEWS.review = () => {
  const items = reviewItems();
  const groups = {};
  items.forEach((i) => (groups[i.kind] ||= []).push(i));

  let h = `<div class="panel"><h2>Needs review <span class="muted">${items.length} open question${items.length === 1 ? "" : "s"}</span></h2>
    <p class="quiet">Everything the syllabi left ambiguous, kept visible instead of quietly resolved. Budget one
      sitting to clear it, then record what you learn in <code>data/changes.md</code> with the authority you heard
      it from — syllabus, announced in class, Blackboard, or email. A missing row looks exactly like a free week,
      which is the most dangerous failure mode in a tracker for eight courses.</p></div>`;

  for (const kind of GROUP_ORDER) {
    const g = groups[kind];
    if (!g || !g.length) continue;            /* collapse to nothing, never a lonely heading */
    h += `<div class="panel"><h2>${esc(kind)} <span class="muted">${g.length}</span></h2>`;
    if (GROUP_NOTE[kind]) h += `<p class="quiet">${esc(GROUP_NOTE[kind])}</p>`;
    /* Only draw a column some row in this group actually fills. An empty
       cell and a missing value look identical, which is the failure mode
       this whole view exists to prevent. */
    const hasWeight = g.some((i) => i.weight);
    const hasWhen = g.some((i) => i.when);
    const hasWhat = g.some((i) => i.what);
    const hasRaw = g.some((i) => i.raw);
    h += `<div class="scroll"><table class="rtable"><thead><tr>
      <th scope="col" style="width:78px">Course</th><th scope="col">Item</th>
      ${hasWeight ? '<th scope="col" class="num" style="width:64px">Weight</th>' : ""}
      ${hasWhen ? '<th scope="col" style="width:96px">When</th>' : ""}
      ${hasWhat || hasRaw ? '<th scope="col">Detail</th>' : ""}</tr></thead><tbody>`;
    for (const i of g) {
      const item = i.who.replace(i.code, "").trim() || i.who;
      h += `<tr data-c="${esc(i.code)}"><td>${pill(i.code)}</td>
        <td><b>${esc(item)}</b>${i.sub ? `<div class="quiet">${esc(i.sub)}</div>` : ""}</td>
        ${hasWeight ? `<td class="num" data-label="Weight">${i.weight ? i.weight + "%" : "—"}</td>` : ""}
        ${hasWhen ? `<td class="nowrap quiet" data-label="When">${i.when ? fmtShort(i.when) : "—"}</td>` : ""}
        ${hasWhat || hasRaw ? `<td>${i.what ? esc(i.what) : ""}
          ${i.raw ? `<details><summary>what the syllabus printed</summary><div class="raw">${esc(i.raw)}</div></details>` : ""}</td>` : ""}
      </tr>`;
    }
    h += `</tbody></table></div></div>`;
  }
  return h;
};

/* ============================================================ interactions */
async function setReading(id, next) {
  const j = await post("/api/progress", { reading_id: id, status: next || "not_started" });
  D.progress = j.progress;
}

document.addEventListener("click", async (e) => {
  /* the per-course master tick: every POST must settle before one re-render,
     or the last write can lose the race (LGL225 week 15 has six chapters). */
  const mb = e.target.closest("[data-master]");
  if (mb) {
    const ids = mb.dataset.master.split(",").filter(Boolean);
    const to = mb.dataset.to;
    mb.disabled = true;
    try {
      for (const id of ids) await setReading(id, to);
    } finally {
      render();
    }
    return;
  }
  const rb = e.target.closest("[data-reading]");
  if (rb) {
    const order = ["", "in_progress", "done"];
    const next = order[(order.indexOf(rb.dataset.s) + 1) % order.length];
    await setReading(rb.dataset.reading, next);
    render();
    return;
  }
  const na = e.target.closest("[data-note]");
  if (na) { e.preventDefault(); openNote(na.dataset.note); return; }

  if (e.target.id === "wk-prev") { state.week = clampWeek(shownWeek() - 1); location.hash = `week/${state.week}`; return; }
  if (e.target.id === "wk-next") { state.week = clampWeek(shownWeek() + 1); location.hash = `week/${state.week}`; return; }
  if (e.target.id === "wk-today") { state.week = null; location.hash = "week"; render(); return; }
  if (e.target.id === "sortdue") { state.sortDueByWeight = !state.sortDueByWeight; render(); return; }
  if (e.target.id === "density") {
    const now = LS.get("beagle-density") === "compact" ? "" : "compact";
    LS.set("beagle-density", now);
    const r = root();
    if (r) { if (now) r.dataset.density = now; else delete r.dataset.density; }
    document.body.classList.toggle("compact", now === "compact");
    render();
    return;
  }

  if (e.target.id === "newnote") {
    const code = $("#newnote-course").value;
    const rowId = $("#newnote-row").value;
    const row = D.schedule.find((r) => r.id === rowId);
    const title = row ? row.topic.split(/[.;:]/)[0].slice(0, 60) : "Notes";
    const j = await post("/api/note", {
      course: row ? row.course : code, title,
      week_of: row ? row.class_date : D.today,
      chapter: row ? row.chapters.replace(/;/g, ", ") : "",
      topic: row ? row.topic : "",
    });
    await load();
    state.view = "notes";
    openNote(j.path);
    return;
  }
  if (e.target.id === "c-add") {
    const style = $("#c-style").value.trim();
    if (!style) { alert("Style of cause is required."); return; }
    const j = await post("/api/case", {
      style_of_cause: style, citation: $("#c-cite").value.trim(),
      canlii_url: $("#c-url").value.trim(), course: $("#c-course").value,
      status: "stub", verified: "no", week_of: D.today,
    });
    D.cases = j.cases; render(); return;
  }
  const del = e.target.closest("[data-case-del]");
  if (del) {
    if (!confirm("Delete this case?")) return;
    const j = await post("/api/case", { id: del.dataset.caseDel, _delete: true });
    D.cases = j.cases; render(); return;
  }
});

document.addEventListener("change", async (e) => {
  if (e.target.id === "csel") { state.course = e.target.value; location.hash = `courses/${e.target.value}`; return; }
  if (e.target.id === "tgt") { state.target = Number(e.target.value) || 70; render(); return; }

  const g = e.target.closest("[data-grade]");
  if (g) {
    const j = await post("/api/grade", { assessment_id: g.dataset.grade, earned_pct: g.value });
    D.grades = j.grades; render(); return;
  }
  const cs = e.target.closest("[data-case-status]");
  if (cs) {
    const c = D.cases.find((x) => x.id === cs.dataset.caseStatus);
    const j = await post("/api/case", { ...c, status: cs.value });
    D.cases = j.cases; return;
  }
  const cv = e.target.closest("[data-case-verified]");
  if (cv) {
    const c = D.cases.find((x) => x.id === cv.dataset.caseVerified);
    const j = await post("/api/case", { ...c, verified: cv.checked ? "yes" : "no" });
    D.cases = j.cases; return;
  }
});

/* [ and ] step the week, the way a page-turner would. */
document.addEventListener("keydown", (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || "")) return;
  if (state.view !== "week") return;
  if (e.key === "[") { state.week = clampWeek(shownWeek() - 1); location.hash = `week/${state.week}`; }
  if (e.key === "]") { state.week = clampWeek(shownWeek() + 1); location.hash = `week/${state.week}`; }
});

if (LS.get("beagle-density") === "compact" && typeof document !== "undefined" && document.body)
  document.body.classList.add("compact");

load().catch((e) => {
  main.innerHTML = `<div class="panel"><h2>Could not load data</h2>
    <p>${esc(e.message)}</p><p class="quiet">Is <code>python serve.py</code> still running?</p></div>`;
});
