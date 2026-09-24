/* Paralegal Beagle — all views. Vanilla JS, no framework, no CDN.
   data/*.csv is the source of truth; everything here is derived on each render.

   Rebuilt on 13 Sep 2026 in the look Rafael chose in Claude Design: a sidebar
   with counts, ruled rows, big countdowns, one red accent. The data logic —
   the two horizons of a week-precision deadline, the master tick, the review
   queue — is unchanged from the previous version and still covered by
   tools/interact.mjs. */

let D = null;
const state = {
  view: "week", course: null, notePath: null, target: 70,
  week: null,            // null = follow today; set by the < today > stepper
};

const $ = (s, r = document) => r.querySelector(s);
const main = $("#main");

const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
const root = () => (typeof document !== "undefined" && document.documentElement) || null;

/* ------------------------------------------------------------ utilities */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const words = (n) => (n >= 0 && n <= 20) ? WORDS[n] : String(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const toDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (s) => { if (!s) return ""; const x = toDate(s); return `${DOW[x.getDay()]} ${x.getDate()} ${MON[x.getMonth()]}`; };
const fmtShort = (s) => { if (!s) return ""; const x = toDate(s); return `${x.getDate()} ${MON[x.getMonth()]}`; };
const fmtLong = (s) => { if (!s) return ""; const x = toDate(s); return `${DOW[x.getDay()]} ${x.getDate()} ${MON[x.getMonth()]} ${x.getFullYear()}`; };
const plus = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return iso(d); };
/* Monday to Friday of a term week, as one range: "7–11 Sept", "28 Sept – 2 Oct". */
function weekRange(n) {
  const a = toDate(weekMonday(n)), b = toDate(plus(weekMonday(n), 4));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MON[a.getMonth()]}`
    : `${a.getDate()} ${MON[a.getMonth()]} – ${b.getDate()} ${MON[b.getMonth()]}`;
}
const list = (s) => String(s || "").split(";").filter(Boolean).join(", ");

function daysBetween(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }
const today = () => D.today;
const termWeek = (s) => Math.floor(daysBetween(D.term.week1_monday, s) / 7) + 1;
const weekMonday = (n) => plus(D.term.week1_monday, (n - 1) * 7);
const LAST_WEEK = () => termWeek(D.term.end);
const clampWeek = (n) => Math.max(1, Math.min(LAST_WEEK(), n));
const nowWeek = () => clampWeek(termWeek(today()));
const shownWeek = () => state.week == null ? nowWeek() : state.week;

const progressMap = () => Object.fromEntries(D.progress.map((p) => [p.reading_id, p]));
const gradeMap = () => Object.fromEntries(D.grades.map((g) => [g.assessment_id, g]));
const course = (code) => D.courses.find((c) => c.code === code) || {};
const courseName = (code) => course(code).name || code;
const isDone = (prog, id) => (prog[id]?.status || "") === "done";

const HEAVY = 90;          /* a week carrying this much grade or more is ruled in red */
/* The label after an item's name: its weight, or "due" for an unweighted
   milestone -- unless the name already ends in "due", or it reads "due due". */
const weightTag = (a) => a.weight_pct ? `${a.weight_pct}%` : (/(^|\W)due(\W|$)/i.test(a.name) ? "" : "due");
const pill = (code) =>
  `<a class="course-pill" data-c="${esc(code)}" href="#courses/${esc(code)}" title="${esc(courseName(code))}">${esc(code)}</a>`;
const typeWord = (t) => `<span class="type ${esc(t)}">${esc(t)}</span>`;

/* A week-precision item has a WINDOW, not a date, so it needs two horizons:
     dMin — the earliest it can happen (that week's Monday). Planning uses
            this: "in 9 days" is the honest warning for a quiz in the week of
            Mon 21 Sep. Measuring to the Sunday said 15 and pushed it out of
            the fortnight entirely.
     dMax — the last day of the window. Used only to decide lateness: nothing
            is overdue until its week has run out.
   Neither invents a weekday; the label still reads "week of 21 Sep". */
const lastPossible = (a) => a.date_precision === "exact" ? a.due_resolved : plus(a.due_resolved, 6);
const dMin = (a) => daysBetween(today(), a.due_resolved);
const dMax = (a) => daysBetween(today(), lastPossible(a));
const isOverdue = (a) => dMax(a) < 0;
const daysLeft = (a) => Math.max(0, dMin(a));

function startBy(a) { return a.due_resolved ? plus(a.due_resolved, -Number(a.lead_days || 7)) : ""; }
function dueSorted() {
  return D.assessments.filter((a) => a.due_resolved).slice()
    .sort((a, b) => a.due_resolved.localeCompare(b.due_resolved) || a.course.localeCompare(b.course));
}
function whenLabel(a) {
  return a.date_precision === "exact" ? fmt(a.due_resolved) : `week of ${fmtShort(a.due_resolved)}`;
}
function relLabel(a) {
  const lo = dMin(a), hi = dMax(a);
  if (hi < 0) return `${Math.abs(hi)} days ago`;
  if (lo <= 0) return a.date_precision === "exact" ? "today" : "this week";
  if (lo === 1) return "tomorrow";
  return `in ${lo} days`;
}
const weightLabel = (a) => a.weight_pct ? `worth ${a.weight_pct}% of the course` : "no separate weight";

/* ------------------------------------------------------------ networking */
async function load() {
  const r = await fetch("/api/data");
  D = await r.json();
  routeFromHash();
  render();
}
async function post(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { alert(j.error || "request failed"); throw new Error(j.error); }
  return j;
}

/* ------------------------------------------------------------ theme */
/* Light is the default. Rafael's Windows is in dark mode and he asked for
   light regardless, so "auto" (follow Windows) is a choice, not the start. */
const THEMES = ["light", "dark", "auto"];
const THEME_LABEL = { light: "☀ Light", dark: "☾ Dark", auto: "◐ Auto" };
function currentTheme() { const t = LS.get("beagle-theme"); return THEMES.includes(t) ? t : "light"; }
function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  LS.set("beagle-theme", next);
  const r = root();
  if (r) { if (next === "auto") delete r.dataset.theme; else r.dataset.theme = next; }
  paintChrome();
}
const isDeadlinesOnly = () => LS.get("beagle-deadlines-only") === "1";
function toggleDeadlinesOnly() { LS.set("beagle-deadlines-only", isDeadlinesOnly() ? "" : "1"); render(); }

/* ------------------------------------------------------------ chrome */
const VIEW_META = {
  week: ["This Week", () => weekSubtitle()],
  deadlines: ["Deadlines", () => "Every graded item and hard milestone in date order — what it covers, when it lands, what it is worth."],
  grid: ["Term Grid", () => `Fifteen weeks against ${words(D.courses.length)} courses. The one view no single syllabus can give you.`],
  crunch: ["Crunch", () => crunchSubtitle()],
  courses: ["Courses", () => "Per-course syllabus, standing and schedule."],
  notes: ["Notes", () => "Reading notes in Markdown, indexed per class meeting."],
  cases: ["Cases", () => "Case briefs with McGill-style citations and CanLII links."],
  review: ["Review", () => `${cap(words(reviewItems().length))} open question${reviewItems().length === 1 ? "" : "s"} the syllabi left ambiguous.`],
};

function weekSubtitle() {
  const wk = shownWeek();
  const reads = D.readings.filter((r) => r.week_no === wk);
  const nCourses = new Set(reads.map((r) => r.course)).size;
  const next = dueSorted().find((a) => !isOverdue(a));
  const a = reads.length
    ? `${cap(words(reads.length))} chapter${reads.length === 1 ? "" : "s"} across ${words(nCourses)} course${nCourses === 1 ? "" : "s"}`
    : `No chapters assigned for week ${wk}`;
  if (!next) return `${a}, and nothing graded left in the term.`;
  const n = daysLeft(next);
  const b = n === 0 ? (next.date_precision === "exact" ? "the first graded item is today" : "the first graded item falls this week")
    : `the first graded item ${words(n)} day${n === 1 ? "" : "s"} out`;
  return `${a}, and ${b}.`;
}
function crunchSubtitle() {
  const ranked = crunchWeeks().filter((x) => x.load).sort((a, b) => b.load - a.load);
  const heavy = ranked.filter((x) => x.load >= HEAVY).length;
  return `Where the term stacks up. ${heavy ? `${cap(words(heavy))} week${heavy === 1 ? " carries" : "s carry"} close to a full course's worth of grade, or more.` : `Heaviest is week ${ranked[0].w} at ${ranked[0].load}%.`}`;
}

function counts() {
  const wk = shownWeek();
  return {
    week: D.readings.filter((r) => r.week_no === wk).length,
    deadlines: D.assessments.length,
    grid: LAST_WEEK(),
    crunch: crunchWeeks().filter((x) => x.load >= HEAVY).length,
    courses: D.courses.length,
    notes: D.notes.length,
    cases: D.cases.length,
    review: reviewItems().length,
  };
}

function paintChrome() {
  const wk = nowWeek(), last = LAST_WEEK();
  $("#wk-big").textContent = String(wk).padStart(2, "0");
  $("#wk-of").textContent = `of ${last}`;
  $("#wk-range").textContent = `Mon ${fmtShort(weekMonday(wk))} — Sun ${fmtShort(plus(weekMonday(wk), 6))}`;
  const c = counts();
  document.querySelectorAll("[data-count]").forEach((el) => { el.textContent = c[el.dataset.count] ?? ""; });
  document.querySelectorAll("#nav a[data-view]").forEach((a) => a.classList.toggle("on", a.dataset.view === state.view));
  const [title, sub] = VIEW_META[state.view] || VIEW_META.week;
  $("#vtitle").textContent = title;
  $("#vsub").textContent = sub();
  $("#todaychip").textContent = fmtLong(today());
  const weighted = D.assessments.filter((a) => a.weight_pct).length;
  $("#footstats").innerHTML = `${D.courses.length} courses · ${D.schedule.length} classes<br>${D.assessments.length} items, ${weighted} carry weight · ${D.readings.length} readings`;
  const tb = $("#theme"); if (tb) tb.textContent = THEME_LABEL[currentTheme()];
}

/* ------------------------------------------------------------ router */
const VIEWS = {};
const ALIAS = { exams: "deadlines" };
let renderedView = null;
/* Re-rendering replaces the whole view, so the scroll position has to be put
   back on purpose. A change of SCREEN goes to the top; a tick, a mark, a
   target change or a week step re-renders in place and stays where you were. */
function render() {
  paintChrome();
  const y = window.scrollY;
  const x = $(".gridwrap")?.scrollLeft || 0;     /* the Term Grid scrolls sideways below 1338px */
  main.innerHTML = VIEWS[state.view]();
  if (state.view !== renderedView) window.scrollTo(0, 0);
  else { window.scrollTo(0, y); if (x) { const g = $(".gridwrap"); if (g) g.scrollLeft = x; } }
  renderedView = state.view;
}
function routeFromHash() {
  const raw = (location.hash || "").replace(/^#/, "");
  if (!raw) return;
  let [v, arg] = raw.split("/");
  v = ALIAS[v] || v;
  if (!VIEWS[v]) return;
  state.view = v;
  if (v === "courses" && arg && D.courses.some((c) => c.code === arg)) state.course = arg;
  if (v === "week") state.week = arg ? clampWeek(Number(arg)) : null;
}
window.addEventListener("hashchange", () => { routeFromHash(); render(); });
$("#theme").addEventListener("click", cycleTheme);

/* ==================================================================== WEEK */
VIEWS.week = () => {
  const wk = shownWeek();
  const nowWk = nowWeek();
  const last = LAST_WEEK();
  const prog = progressMap();
  const gm = gradeMap();
  let h = "";

  /* ---- week stepper ---------------------------------------------- */
  h += `<div class="gtools"><span class="wknav">
    <button id="wk-prev" class="ghost" ${wk <= 1 ? "disabled" : ""} title="Previous week ( [ )">‹ ${wk > 1 ? "week " + (wk - 1) : "week"}</button>
    <b>Week ${wk} of ${last}</b>
    <button id="wk-next" class="ghost" ${wk >= last ? "disabled" : ""} title="Next week ( ] )">${wk < last ? "week " + (wk + 1) : "week"} ›</button></span>
    <span class="quiet">${fmt(weekMonday(wk))} – ${fmt(plus(weekMonday(wk), 6))}</span>
    ${wk !== nowWk ? `<button id="wk-today" class="ghost">back to this week</button>` : `<span class="quiet">this week</span>`}
    ${holidayNote(wk)}
  </div>`;

  /* ---- what lands next: three cards ------------------------------ */
  const upcoming = dueSorted().filter((a) => !isOverdue(a));
  const within7 = upcoming.filter((a) => daysLeft(a) <= 7).length;
  const within14 = upcoming.filter((a) => daysLeft(a) <= 14).length;
  const three = upcoming.slice(0, 3);
  h += `<section class="sec"><span class="lbl">What lands next — ${within7 ? `${words(within7)} due inside the next 7 days` : "nothing is due inside the next 7 days"}</span>
    <div class="cards">${three.map((a, n) => {
      const d = daysLeft(a), open = dMin(a) <= 0;
      return `<div class="card ${n === 0 ? "next" : ""}" data-c="${esc(a.course)}">
        <div class="days"><b>${open ? "now" : d}</b><span>${open ? (a.date_precision === "exact" ? "today" : "this week") : `day${d === 1 ? "" : "s"}`}</span></div>
        <div class="who">${pill(a.course)} ${typeWord(a.type)}</div>
        <div class="name">${esc(a.name)}</div>
        <div class="when">${whenLabel(a)} · ${weightLabel(a)}</div>
      </div>`;
    }).join("") || `<div class="card"><div class="name">Nothing graded ahead</div><div class="when">Every dated item in the syllabi has passed.</div></div>`}</div>
    ${within14 > 3 ? `<div class="note">${words(within14 - 3)} more inside the fortnight — <a href="#deadlines">see every deadline</a>.</div>` : ""}
  </section>`;

  /* ---- overdue, before anything else ------------------------------ */
  const over = dueSorted().filter((a) => isOverdue(a) && !gm[a.id]?.earned_pct);
  if (over.length) {
    h += `<div class="callout"><span class="lbl">Past its date — ${words(over.length)} item${over.length === 1 ? "" : "s"}</span>
      <ul>${over.map((a) => `<li><b>${esc(a.course)} ${esc(a.name)}</b> · ${a.weight_pct}% · ${whenLabel(a)}
        <span class="tag overdue">${Math.abs(dMax(a))}d ago</span></li>`).join("")}</ul>
      <div class="quiet">If one of these is marked and returned, enter the mark in Courses and it stops showing here.</div></div>`;
  }

  /* ---- the week band: items the syllabus dates only to a week ------ */
  const band = D.assessments.filter((a) => a.week_no === wk && a.date_precision !== "exact");
  if (band.length) {
    h += `<div class="weekband" style="margin-top:16px"><span class="lbl">The syllabus gives a week, not a day</span>
      ${band.map((a) => `<div class="wbrow">${pill(a.course)} ${typeWord(a.type)} <b>${esc(a.name)}</b>
        <span>${a.weight_pct ? a.weight_pct + "%" : ""}</span>
        <div class="quiet" style="flex:1 1 100%">${esc(a.due_date_raw)}${a.note ? " — " + esc(a.note) : ""}</div></div>`).join("")}
      <div class="quiet" style="margin-top:6px">Filing these on a Monday would be a guess. Confirm the day in class, then correct
        <code>data/assessments.csv</code> and note who told you in <code>data/changes.md</code>.</div></div>`;
  }

  /* ---- readings beside the runway --------------------------------- */
  const reads = D.readings.filter((r) => r.week_no === wk);
  const done = reads.filter((r) => isDone(prog, r.id)).length;
  h += `<div class="split"><section>
    <div class="sechead"><h2>Readings for week ${wk}</h2><span class="mono sub2"><b>${done}</b> of ${reads.length} done</span></div>`;
  const meetings = D.schedule.filter((r) => r.week_no === wk && r.due_type !== "study_week")
    .slice().sort((a, b) => a.class_date.localeCompare(b.class_date) || a.course.localeCompare(b.course));
  if (!meetings.length) h += `<div class="rfoot">No class meetings in week ${wk}.</div>`;
  for (const m of meetings) {
    const chs = reads.filter((r) => r.schedule_id === m.id);
    const doneN = chs.filter((r) => isDone(prog, r.id)).length;
    h += `<article class="rrow" data-c="${esc(m.course)}">
      <div class="key"><div class="code">${esc(m.course)}</div><div class="date">${fmt(m.class_date)}</div></div>
      <div style="min-width:0">
        <div class="rhead"><h3>${esc(courseName(m.course))}</h3>
          ${chs.length > 1 ? `<button class="ghost" data-master="${chs.map((r) => esc(r.id)).join(",")}" data-to="${doneN === chs.length ? "not_started" : "done"}">${doneN === chs.length ? "clear all" : "all done"}</button>` : ""}</div>
        ${m.topic && !sameText(m.topic, m.due_item) ? `<p class="topic">${esc(m.topic)}</p>` : ""}
        ${m.due_item ? `<div style="margin:0 0 10px"><span class="tag ${esc(m.due_type)}">${esc(m.due_item)}</span></div>` : ""}
        <div class="chips">${chs.map((r) => chapterChip(r, prog[r.id])).join("")}
          ${!chs.length ? `<span class="quiet">${m.reading_raw ? esc(m.reading_raw) : "No chapter reading listed for this class."}</span>` : ""}</div>
        ${unpairedNote(chs)}
        ${lsoLine(m)}
        ${m.note ? `<div class="meta">${esc(m.note)}</div>` : ""}
        ${m.confidence && m.confidence !== "high" ? `<div class="meta"><span class="tag unstated">check this row against the PDF</span></div>` : ""}
      </div>
    </article>`;
  }
  /* backlog */
  const behind = D.readings.filter((r) => r.week_no < nowWk && !isDone(prog, r.id));
  if (!behind.length) {
    h += `<div class="rfoot">Nothing outstanding from earlier weeks — you are level with week ${nowWk}.</div>`;
  } else {
    const bc = {};
    behind.forEach((r) => (bc[r.course] ||= []).push(r));
    h += `<div class="rfoot" id="backlog"><span class="lbl red">Not yet read from earlier weeks — ${words(behind.length)} chapter${behind.length === 1 ? "" : "s"}</span>
      ${Object.keys(bc).sort().map((code) => `<div class="row" style="margin-top:10px" data-c="${esc(code)}">${pill(code)}
        <div class="chips">${bc[code].map((r) => chapterChip(r, prog[r.id], true)).join("")}</div></div>`).join("")}</div>`;
  }
  h += `</section>`;

  /* the runway */
  const weeks = crunchWeeks();
  const max = Math.max(...weeks.map((x) => x.load), 1);
  const ranked = weeks.filter((x) => x.load).sort((a, b) => b.load - a.load);
  h += `<aside><div class="ahead"><h2>Term runway</h2><p>Share of your final grade falling due each week. Click a week to open it.</p></div>`;
  for (const x of weeks) {
    const cls = [x.w === nowWk ? "now" : "", x.load >= HEAVY ? "hot" : "", x.isBreak ? "break" : ""].filter(Boolean).join(" ");
    h += `<a class="runway ${cls}" href="#week/${x.w}" title="${esc(x.isBreak ? "Study week" : x.load ? x.items.map((a) => `${a.course} ${a.name} ${a.weight_pct}%`).join("; ") : "nothing due")}">
      <span class="no">${x.w}</span>
      <span class="trk"><i style="width:${x.isBreak ? 0 : (x.load / max * 100).toFixed(1)}%"></i></span>
      <span class="pct">${x.isBreak ? "—" : x.load + "%"}</span></a>`;
  }
  if (ranked.length) {
    const [p, q, r] = ranked;
    h += `<div class="peak"><span class="lbl">Peak</span><div class="v">Week ${p.w} · ${p.load}%</div>
      <p>${cap(words(p.items.length))} item${p.items.length === 1 ? "" : "s"} in one week, ${fmtShort(weekMonday(p.w))}.${q ? ` Week ${q.w} (${q.load}%)${r ? ` and week ${r.w} (${r.load}%)` : ""} ${r ? "are" : "is"} next.` : ""}</p></div>`;
  }
  h += `</aside></div>`;
  return h;
};

function holidayNote(wk) {
  const mon = weekMonday(wk);
  const bits = Object.keys(D.term.holidays).filter((d) => d >= mon && d <= plus(mon, 6)).map((d) => `${D.term.holidays[d]}, ${fmt(d)}`);
  if (D.term.study_week[0] >= mon && D.term.study_week[0] <= plus(mon, 6)) bits.push("study week — no classes");
  if (D.term.drop_deadline >= mon && D.term.drop_deadline <= plus(mon, 6)) bits.push(`${D.term.drop_deadline_label}, ${fmt(D.term.drop_deadline)}`);
  return bits.length ? `<span class="quiet">${esc(bits.join(" · "))}</span>` : "";
}

/* Ranges the syllabus lists for a class without attaching them to a chapter
   are shown once, in words, under the chips -- not on every chip, where
   "ch 1 class pp. 65-79" read as Chapter 1's pages. */
function unpairedNote(chs) {
  const u = chs.find((r) => r.all_pages);
  return u ? `<div class="meta">The syllabus lists pages ${esc(list(u.all_pages))} for this class without saying which chapter they belong to.</div>` : "";
}
const sameText = (a, b) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/* Six syllabi print "LSO Competencies: 202, 204" beside a class's readings:
   the numbered items of the Law Society of Ontario's paralegal competency
   list. The syllabi give the numbers and nothing else, so that is what is
   shown, in the order each syllabus prints them. LGL154 and LGL225 list
   none. Written with the class, not the chapter, because that is how the
   syllabi attach them. */
const LSO_TITLE = "Law Society of Ontario paralegal competencies, numbered as in the syllabus";
function lsoLine(r, short) {
  if (!r.lso_nums) return "";
  return `<div class="lso${short ? "" : " meta"}" title="${LSO_TITLE}">${short ? "LSO" : "LSO competencies"} ${esc(list(r.lso_nums))}</div>`;
}

function chapterChip(r, p, showWeek) {
  const s = p?.status || "";
  const pages = r.pages ? `<span class="pg">pp. ${esc(list(r.pages))}</span>` : "";
  const label = `Chapter ${r.chapter}${r.pages ? `, pages ${list(r.pages)}` : ""} — ${s === "done" ? "done" : s === "in_progress" ? "in progress" : "not started"}`;
  return `<button class="chch" data-s="${esc(s)}" data-reading="${esc(r.id)}" aria-label="${esc(label)}" title="not started → in progress → done">
    <span class="box"></span><span class="lab">ch ${esc(r.chapter)}</span>${pages}${showWeek ? `<span class="pg">wk ${r.week_no}</span>` : ""}</button>`;
}

/* =============================================================== DEADLINES */
VIEWS.deadlines = () => {
  const items = dueSorted();
  const stated = items.filter((a) => ["exam", "test", "quiz"].includes(a.type) && a.scope_source === "stated").length;
  const examish = items.filter((a) => ["exam", "test", "quiz"].includes(a.type)).length;
  const nextUp = items.find((a) => !isOverdue(a));
  let h = `<div class="pad" style="border-bottom:1px solid var(--line);background:var(--surf)">
    <p style="margin:0;font-size:13.5px;color:var(--ink2);max-width:78ch">Scope is shown only where a syllabus states it.
      <b>Not stated</b> means ask the professor — ${words(stated)} of ${words(examish)} exams, tests and quizzes name their chapters,
      and the rest carry no guarantee that the exam is forward-looking.</p></div>`;
  let lastMonth = "";
  for (const a of items) {
    const m = MONTH_FULL[toDate(a.due_resolved).getMonth()];
    if (m !== lastMonth) { h += `<div class="month lbl">${esc(m)}</div>`; lastMonth = m; }
    h += deadlineRow(a, a === nextUp);
  }
  return h + `<div class="spacer"></div>`;
};

function scopeLine(a) {
  if (a.scope_chapters) return `<b>Chapters ${esc(list(a.scope_chapters))}</b> — stated in the syllabus${a.note ? ". " + esc(a.note) : ""}`;
  if (["exam", "test", "quiz"].includes(a.type)) return `<span class="tag unstated">not stated — ask your professor</span>${a.note ? ` <span class="quiet">${esc(a.note)}</span>` : ""}`;
  return a.note ? esc(a.note) : "";
}
function deadlineRow(a, isNext, extra) {
  const meta = [a.materials_allowed, a.format, a.duration].filter(Boolean).join(" · ");
  return `<article class="drow ${esc(a.type)} ${isNext ? "next" : ""} ${isOverdue(a) ? "past" : ""}" data-c="${esc(a.course)}" id="dl-${esc(a.id)}">
    <div class="key"><div class="code">${esc(a.course)}</div><div class="type ${esc(a.type)}">${esc(a.type)}</div></div>
    <div class="dbody" style="min-width:0"><h3>${esc(a.name)}</h3><div class="course">${esc(courseName(a.course))}</div>
      <div class="scope">${scopeLine(a)}</div>${meta ? `<div class="scope quiet">${esc(meta)}</div>` : ""}</div>
    <div class="when"><b>${whenLabel(a)}</b><div>${relLabel(a)}</div></div>
    <div class="weight">${extra || `<b>${a.weight_pct ? a.weight_pct + "%" : "—"}</b><span>${a.weight_pct ? "of course" : "no weight"}</span>`}</div>
  </article>`;
}

/* ==================================================================== GRID */
VIEWS.grid = () => {
  const codes = D.courses.map((c) => c.code);
  const prog = progressMap();
  const nowWk = nowWeek(), last = LAST_WEEK();
  let h = `<div class="gtools">
    <button id="deadlines-only" aria-pressed="${isDeadlinesOnly()}">${isDeadlinesOnly() ? "showing deadlines only" : "show deadlines only"}</button></div>`;
  h += `<div class="gridwrap"><div class="grid ${isDeadlinesOnly() ? "deadlines-only" : ""}">
    <div class="grow head"><div class="gwk lbl">Week</div>${codes.map((c) => `<div class="gcell" data-c="${esc(c)}">
      <a class="code" href="#courses/${esc(c)}" style="text-decoration:none;color:inherit">${esc(c)}</a><div class="short">${esc(courseName(c))}</div></div>`).join("")}</div>`;
  for (let w = 1; w <= last; w++) {
    const mon = weekMonday(w);
    const marks = [];
    Object.keys(D.term.holidays).forEach((d) => { if (d >= mon && d <= plus(mon, 6)) marks.push(`${D.term.holidays[d]} — ${fmt(d)}`); });
    if (D.term.drop_deadline >= mon && D.term.drop_deadline <= plus(mon, 6)) marks.push(`${D.term.drop_deadline_label} — ${fmt(D.term.drop_deadline)}`);
    if (D.term.grades_released >= mon && D.term.grades_released <= plus(mon, 6)) marks.push(`Grades released — ${fmt(D.term.grades_released)}`);
    if (marks.length) h += `<div class="gnote">${esc(marks.join("  ·  "))}</div>`;
    h += `<div class="grow ${w === nowWk ? "now" : ""}"><div class="gwk"><div class="n">Week ${w}</div><div class="d">${weekRange(w)}</div></div>`;
    for (const code of codes) {
      const rows = D.schedule.filter((r) => r.course === code && r.week_no === w);
      if (!rows.length) { h += `<div class="gcell off">no class</div>`; continue; }
      if (rows.every((r) => r.due_type === "study_week")) { h += `<div class="gcell break">study week</div>`; continue; }
      const reads = D.readings.filter((r) => r.course === code && r.week_no === w);
      const dues = D.assessments.filter((a) => a.course === code && a.week_no === w);
      const unsure = rows.find((r) => r.confidence && r.confidence !== "high");
      /* Graded items first: they are what matters most in a week, so they sit
         at the top of the cell, above the chapters (Rafael, 17 Sep 2026). */
      let cell = dues.map((a) => `<div><span class="tag ${esc(a.type)}">${esc(a.name)}${weightTag(a) ? ` <b>${weightTag(a)}</b>` : ""}</span>
          ${a.scope_chapters ? `<div class="cov">covers ch ${esc(list(a.scope_chapters))}</div>` : ""}</div>`).join("");
      /* Then one tick chip per chapter -- the same chip as This Week and Courses,
         reading the same progress row, so a tick made anywhere shows here. */
      cell += reads.length ? `<div class="chips">${reads.map((r) => chapterChip(r, prog[r.id])).join("")}</div>`
        : (dues.length || unsure) ? "" : `<span class="muted">—</span>`;     /* a class with nothing assigned */
      cell += rows.map((r) => lsoLine(r, true)).join("");
      if (unsure) cell += `<div><span class="tag unstated" title="${esc(unsure.note || "confidence: " + unsure.confidence)}">check</span></div>`;
      h += `<div class="gcell ${unsure ? "unsure" : ""}">${cell}</div>`;
    }
    h += `</div>`;
  }
  return h + `</div></div>${legend()}<div class="spacer"></div>`;
};

function legend() {
  return `<div class="legend">${D.courses.map((c) =>
    `<a href="#courses/${esc(c.code)}" data-c="${esc(c.code)}" title="${esc(c.name)}"><span class="dot"></span><span class="code">${esc(c.code)}</span></a>`).join("")}</div>`;
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
  const nowWk = nowWeek();
  const max = Math.max(...weeks.map((x) => x.load), 1);
  const ranked = weeks.filter((x) => x.load).sort((a, b) => b.load - a.load);
  const twoHeavy = weeks.filter((x) => x.heavy >= 2);
  const free = weeks.filter((x) => !x.load && !x.isBreak);
  const breaks = weeks.filter((x) => x.isBreak).length;
  const flat = 100 / weeks.filter((x) => !x.isBreak).length;
  const bad = D.courses.map((c) => c.code).filter((code) => Math.abs(
    D.assessments.filter((a) => a.course === code).reduce((s, a) => s + Number(a.weight_pct || 0), 0) - 100) > 0.5);

  let h = `<div class="stats">
    <div class="stat"><span class="lbl">Heaviest week</span><div class="v red">${ranked[0].load}%</div><div class="n">week ${ranked[0].w}, ${fmtShort(weekMonday(ranked[0].w))}</div></div>
    <div class="stat"><span class="lbl">Weeks with two big items</span><div class="v">${twoHeavy.length}</div><div class="n">two or more worth 20% or more</div></div>
    <div class="stat"><span class="lbl">Weeks with nothing due</span><div class="v">${free.length}</div><div class="n">of ${weeks.length} — ${weeks.length - free.length - breaks} carry weight, ${breaks} study week</div></div>
    <div class="stat"><span class="lbl">Weights accounted for</span><div class="v">${bad.length ? "check" : "100%"}</div>
      <div class="n">${bad.length ? `these courses do not add up: ${bad.join(", ")}` : `every course adds up, across ${D.assessments.length} items`}</div></div>
  </div>`;
  h += `<div class="sechead"><h2>Grade falling due, week by week</h2></div>
    <p class="pad" style="padding-top:0;font-size:13.5px;color:var(--ink2);max-width:70ch">Each bar is one week, each block one graded item, sized by its weight and coloured by course.
      Exams and tests are ruled in red below. An even spread would be ${flat.toFixed(1)}% a week — the dashed line. Never hours: five of the eight syllabi give no page counts, so an hours figure would be invented.</p>`;
  for (const x of weeks) {
    const mon = weekMonday(x.w);
    const marks = [];
    Object.keys(D.term.holidays).forEach((d) => { if (d >= mon && d <= plus(mon, 6)) marks.push(`${D.term.holidays[d]}, ${fmt(d)}`); });
    if (D.term.drop_deadline >= mon && D.term.drop_deadline <= plus(mon, 6)) marks.push(`${D.term.drop_deadline_label}, ${fmt(D.term.drop_deadline)}`);
    if (marks.length) h += `<div class="note">${esc(marks.join(" · "))}</div>`;
    const cls = [x.w === nowWk ? "now" : "", x.load >= HEAVY ? "hot" : "", x.isBreak ? "break" : ""].filter(Boolean).join(" ");
    h += `<div class="cw ${cls}"><div><div class="wkl">Week ${x.w}</div><div class="wkd">${fmtShort(mon)}</div></div>
      <div class="bars" title="${esc(x.isBreak ? "Study week" : x.load ? x.items.map((a) => `${a.course} ${a.name} ${a.weight_pct}%`).join("; ") : "nothing due")}">
        <span class="flat" style="--flat:${(flat / max * 100).toFixed(2)}%"></span>
        <span style="display:flex;width:${(x.load / max * 100).toFixed(2)}%">${x.items.filter((a) => Number(a.weight_pct) > 0).map((a) =>
          `<span class="seg" data-c="${esc(a.course)}" style="--v:${Number(a.weight_pct)}" title="${esc(a.course + " " + a.name + " " + a.weight_pct + "%")}"></span>`).join("")}</span>
      </div>
      <div class="pct">${x.load ? x.load + "%" : x.isBreak ? "—" : "0"}</div></div>`;
    if (x.items.length) h += `<div class="citems">${x.items.map((a) =>
      `<span class="citem ${esc(a.type)}" data-c="${esc(a.course)}"><span class="code">${esc(a.course)}</span><span>${esc(a.name)}</span>${weightTag(a) ? `<span style="font-weight:800">${weightTag(a)}</span>` : ""}</span>`).join("")}</div>`;
  }
  return h + legend() + `<div class="spacer"></div>`;
};

/* ================================================================= COURSES */
VIEWS.courses = () => {
  const code = state.course || D.courses[0].code;
  state.course = code;
  const c = course(code);
  const prog = progressMap();
  const gm = gradeMap();
  const items = D.assessments.filter((a) => a.course === code).slice().sort((x, y) => (x.due_resolved || "").localeCompare(y.due_resolved || ""));
  const graded = items.filter((a) => gm[a.id]?.earned_pct !== undefined && gm[a.id]?.earned_pct !== "");
  const gradedWeight = graded.reduce((s, a) => s + Number(a.weight_pct || 0), 0);
  const banked = graded.reduce((s, a) => s + Number(a.weight_pct || 0) * Number(gm[a.id].earned_pct) / 100, 0);
  const remaining = 100 - gradedWeight;
  const standing = gradedWeight ? banked / gradedWeight * 100 : null;
  const needed = remaining > 0 ? (state.target - banked) / remaining * 100 : null;
  const weightSum = items.reduce((s, a) => s + Number(a.weight_pct || 0), 0);
  const reads = D.readings.filter((r) => r.course === code);
  const readDone = reads.filter((r) => isDone(prog, r.id)).length;
  const nextUp = items.find((a) => !isOverdue(a));

  let h = `<div class="gtools"><label for="csel" style="margin:0">Course</label>
    <select id="csel">${D.courses.map((x) => `<option value="${esc(x.code)}" ${x.code === code ? "selected" : ""}>${esc(x.code)} — ${esc(x.name)}</option>`).join("")}</select>
    ${legend().replace('class="legend"', 'class="legend" style="padding:0"')}</div>`;

  h += `<div class="cols" data-c="${esc(code)}" style="border-bottom:2px solid var(--rule);background:var(--surf)">
    <div class="pad"><h2>${pill(code)} <span class="course-title">${esc(c.name)}</span></h2>
      <dl class="kv" style="margin-top:12px">
        <dt>Instructor</dt><dd>${c.instructor ? `${esc(c.instructor)}${c.email ? ` · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}` : `<span class="tag unstated">not named in syllabus</span>`}</dd>
        ${c.mode ? `<dt>Mode</dt><dd>${esc(c.mode)}</dd>` : ""}
        <dt>Meets</dt><dd>${c.meeting_days ? esc(c.meeting_days) : `<span class="tag unstated">not stated</span>`}</dd>
        <dt>Textbook</dt><dd>${c.textbook ? `${esc(c.textbook)}<div class="quiet">${esc(c.textbook_author)}${c.textbook_isbn ? " · ISBN " + esc(c.textbook_isbn) : ""}</div>` : `<span class="tag unstated">not named in syllabus</span>`}</dd>
        ${c.class_nbr ? `<dt>Class nbr</dt><dd>${esc(c.class_nbr)}${c.section ? " · section " + esc(c.section) : ""}</dd>` : ""}
        <dt>Reading</dt><dd>${reads.length ? `${readDone} of ${reads.length} readings done<div class="bar" style="margin-top:5px;max-width:240px"><i style="width:${readDone / reads.length * 100}%"></i></div>` : `<span class="tag unstated">no readings listed</span>`}</dd>
      </dl>
      ${c.note ? `<div class="callout" style="margin:14px 0 0">${esc(c.note)}</div>` : ""}
    </div>
    <div class="pad"><h2>Standing</h2>
      <div class="stats standing">
        <div class="stat"><span class="lbl">Graded so far</span><div class="v">${gradedWeight}%</div><div class="n">of the course marked</div></div>
        <div class="stat"><span class="lbl">Average on it</span><div class="v">${standing === null ? "—" : standing.toFixed(1) + "%"}</div><div class="n">${standing === null ? "nothing marked yet" : `${banked.toFixed(1)} points banked`}</div></div>
        <div class="stat"><span class="lbl">Still to come</span><div class="v">${remaining}%</div><div class="n">${items.length - graded.length} item${items.length - graded.length === 1 ? "" : "s"} unmarked</div></div>
        <div class="stat"><span class="lbl">Need on the rest</span>
          <div class="v ${needed !== null && needed > 85 && gradedWeight > 0 ? "red" : ""}">${gradedWeight > 0 ? (needed === null ? "—" : needed <= 0 ? "secured" : needed > 100 ? "out of reach" : needed.toFixed(1) + "%") : "—"}</div>
          <div class="n">${gradedWeight > 0 ? `to finish on ${state.target}%` : "enter your first mark and this fills in"}</div></div>
      </div>
      <div class="row" style="margin-top:14px"><label for="tgt" style="margin:0">Target</label><input id="tgt" class="mark" type="number" min="0" max="100" value="${state.target}"> <span class="quiet">%</span></div>
      <p class="quiet" style="margin-top:10px">Seneca's drop-without-academic-penalty deadline is <b>${fmt(D.term.drop_deadline)}</b>, which is when this number matters most.</p>
    </div></div>`;

  h += `<div class="sechead"><h2>Assessments</h2><span class="mono sub2">${items.length} items · ${weightSum}% of the grade</span></div>`;
  if (Math.abs(weightSum - 100) > 0.5) {
    h += `<div class="callout"><span class="lbl">These weights do not add up to 100%</span>${weightSum}% is accounted for, so ${(100 - weightSum).toFixed(1)}% is missing.
      A component was probably missed when the syllabus was read. Check before relying on the standing figures.</div>`;
  }
  for (const a of items) {
    const g = gm[a.id] || {};
    h += deadlineRow(a, a === nextUp,
      `<b>${a.weight_pct ? a.weight_pct + "%" : "—"}</b><span style="margin-top:8px"><input class="mark" type="number" min="0" max="100" step="0.1" data-grade="${esc(a.id)}" value="${esc(g.earned_pct || "")}" placeholder="mark" aria-label="Mark for ${esc(a.name)}, percent"></span>${g.returned_date ? `<span>returned ${esc(g.returned_date)}</span>` : ""}`);
  }

  h += `<div class="sechead" style="border-top:2px solid var(--rule);margin-top:12px"><h2>Schedule and readings</h2></div>`;
  for (const r of D.schedule.filter((x) => x.course === code)) {
    const isBreak = r.due_type === "study_week";
    const rd = D.readings.filter((x) => x.schedule_id === r.id);
    h += `<article class="rrow ${r.week_no === nowWeek() ? "now" : ""}" data-c="${esc(code)}">
      <div class="key"><div class="code" style="font-family:var(--sans);font-size:13px">${fmt(r.class_date)}</div><div class="wk">week ${r.week_no}</div></div>
      <div style="min-width:0">
        ${isBreak ? `<span class="tag">study week</span>` : (sameText(r.topic, r.due_item) ? "" : `<p class="topic" style="margin-top:0;color:var(--ink)">${esc(r.topic)}</p>`)}
        ${r.note ? `<div class="meta" style="margin-bottom:8px">${esc(r.note)}</div>` : ""}
        <div class="chips">${rd.map((x) => chapterChip(x, prog[x.id])).join("")}
          ${!rd.length && r.reading_raw ? `<span class="quiet">${esc(r.reading_raw)}</span>` : ""}
          ${r.due_item ? `<span class="tag ${esc(r.due_type)}">${esc(r.due_item)}</span>` : ""}</div>
        ${unpairedNote(rd)}
        ${lsoLine(r)}
      </div></article>`;
  }
  return h + `<div class="rfoot">The verbatim syllabus wording is kept in <code>reading_raw</code> and <code>date_raw</code> in <code>data/schedule.csv</code>, so any figure here traces back to a page of the original PDF.</div>`;
};

/* =================================================================== NOTES */
VIEWS.notes = () => {
  const byCourse = {};
  D.notes.forEach((n) => (byCourse[n.course || "—"] ||= []).push(n));
  let h = `<div class="gtools">
    <select id="newnote-course" aria-label="Course for the new note">${D.courses.map((c) => `<option value="${esc(c.code)}" ${c.code === (state.noteCourse || D.courses[0].code) ? "selected" : ""}>${esc(c.code)} — ${esc(c.name)}</option>`).join("")}</select>
    <select id="newnote-row" aria-label="Class meeting to base the note on"><option value="">— blank note —</option>
      ${D.schedule.filter((r) => r.course === (state.noteCourse || D.courses[0].code) && r.due_type !== "study_week")
        .map((r) => `<option value="${esc(r.id)}">${fmtShort(r.class_date)} · wk ${r.week_no} · ${esc(r.topic.slice(0, 60))}</option>`).join("")}
    </select>
    <button id="newnote" class="primary">+ New note</button>
    <span class="quiet">Plain Markdown under <code>notes/&lt;COURSE&gt;/</code>. Write them here or in any editor.</span></div>`;
  if (!D.notes.length) {
    return h + `<div class="empty"><div class="lead"><h2>No notes yet</h2>
      <p>Pick a class meeting above and press <b>New note</b>. The template opens with Rule, Elements, Exceptions, Cases and Questions for the professor — the shape you will want in November.</p></div></div>`;
  }
  h += `<div class="notelayout"><div class="notelist">`;
  for (const code of Object.keys(byCourse).sort()) {
    h += `<div class="grp lbl" data-c="${esc(code)}">${esc(code)} <span style="font-weight:400;letter-spacing:0;text-transform:none">${esc(courseName(code))}</span></div>`;
    h += byCourse[code].sort((a, b) => (b.week_of || "").localeCompare(a.week_of || ""))
      .map((n) => `<a href="#" data-note="${esc(n.path)}" class="${n.path === state.notePath ? "on" : ""}">${esc(n.title)}<div class="quiet">${n.week_of ? fmtShort(n.week_of) + " · " : ""}${n.words} words</div></a>`).join("");
  }
  h += `</div><div class="pad" id="notepane">${state.notePath ? `<p class="muted">loading ${esc(state.notePath)}…</p>` : `<div class="empty" style="padding:0"><div class="lead"><h2>Pick a note</h2><p>Or create one from a class meeting above.</p></div></div>`}</div></div>`;
  return h;
};

async function openNote(path) {
  state.notePath = path;
  render();
  const r = await fetch("/api/note?path=" + encodeURIComponent(path));
  const j = await r.json();
  const pane = $("#notepane");
  if (!pane) return;
  pane.innerHTML = `<div class="spread"><h2>${esc(path)}</h2><div class="row"><button id="note-edit" class="primary">Edit</button><button id="note-open" class="ghost">Open in editor</button></div></div>
    <div class="md" id="noterender" style="margin-top:14px">${md(j.text)}</div>`;
  $("#note-edit").onclick = () => {
    pane.innerHTML = `<div class="spread"><h2>${esc(path)}</h2><div class="row"><button id="note-save" class="primary">Save</button><button id="note-cancel" class="ghost">Cancel</button></div></div>
      <textarea id="noteedit" aria-label="Note source" style="margin-top:14px">${esc(j.text)}</textarea>`;
    $("#note-save").onclick = async () => { await post("/api/note", { path, text: $("#noteedit").value }); await load(); openNote(path); };
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
    if ((m = raw.match(/^(#{1,4})\s+(.*)$/))) { closeList(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if ((m = raw.match(/^\s*[-*]\s+(.*)$/))) { if (listType !== "ul") { closeList(); out.push("<ul>"); listType = "ul"; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = raw.match(/^\s*\d+[.)]\s+(.*)$/))) { if (listType !== "ol") { closeList(); out.push("<ol>"); listType = "ol"; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = raw.match(/^>\s?(.*)$/))) { closeList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    if (!raw.trim()) { closeList(); continue; }
    closeList(); out.push(`<p>${inline(raw)}</p>`);
  }
  closeList(); if (inCode) out.push("</pre>");
  return out.join("\n");
}

/* =================================================================== CASES */
VIEWS.cases = () => {
  let h = `<div class="pad" style="border-bottom:2px solid var(--rule);background:var(--surf)">
    <p class="sub2" style="max-width:78ch">LGL151, LGL152 and LGL250 all assign heavy case reading. Cite to the <b>McGill Guide</b>, not Bluebook — the habit is cheaper to build now than to unlearn.
      <b>Verified</b> means you have opened the decision yourself on CanLII: nothing goes into graded work until its Verified box is ticked.</p>
    <div class="caseform">
      <div class="field"><label for="c-style">Style of cause</label><input id="c-style" placeholder="Jones v Tsige" style="width:100%"></div>
      <div class="field"><label for="c-cite">Citation</label><input id="c-cite" placeholder="2012 ONCA 32" style="width:100%"></div>
      <div class="field"><label for="c-url">CanLII URL</label><input id="c-url" placeholder="https://canlii.ca/t/…" style="width:100%"></div>
      <div class="field"><label for="c-course">Course</label><select id="c-course" style="width:100%"><option value="">— choose course —</option>${D.courses.map((c) => `<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.name)}</option>`).join("")}</select></div>
      <button id="c-add" class="primary">+ Add case</button>
    </div></div>`;
  if (!D.cases.length) {
    return h + `<div class="empty"><div class="lead"><h2>No cases yet</h2><p>Add the first one you are assigned. Style of cause is the only required field — citation and CanLII link can follow once you have looked the decision up.</p></div></div>`;
  }
  h += `<div class="scroll pad"><table class="rtable"><thead><tr><th scope="col">Style of cause</th><th scope="col">Citation</th><th scope="col">Course</th><th scope="col">Status</th><th scope="col">Verified</th><th scope="col"></th></tr></thead><tbody>`;
  for (const c of D.cases) {
    h += `<tr data-c="${esc(c.course)}"><td><b>${c.canlii_url ? `<a href="${esc(c.canlii_url)}" target="_blank" rel="noreferrer">${esc(c.style_of_cause)}</a>` : esc(c.style_of_cause)}</b></td>
      <td class="raw" data-label="Citation">${esc(c.citation)}</td><td data-label="Course">${pill(c.course)}</td>
      <td data-label="Status"><select data-case-status="${esc(c.id)}" aria-label="Status">${["stub", "drafted", "reviewed", "exam-ready"].map((s) => `<option ${c.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
      <td data-label="Verified"><input type="checkbox" data-case-verified="${esc(c.id)}" ${c.verified === "yes" ? "checked" : ""} aria-label="Verified on CanLII"></td>
      <td><button class="ghost" data-case-del="${esc(c.id)}" aria-label="Delete case">×</button></td></tr>`;
  }
  return h + `</tbody></table></div>`;
};

/* ================================================================== REVIEW */
function reviewItems() {
  const out = [];
  const FLAG = /confirm|unconfirmed|clash|check|ask|closed|before this row|previous week/i;
  /* One row per assessment: an unstated exam scope that also carries a note
     is one question with a note, not two questions. */
  for (const a of D.assessments) {
    const base = { who: `${a.course} ${a.name}`, sub: courseName(a.course), code: a.course, weight: a.weight_pct, when: a.due_resolved, prec: a.date_precision, raw: a.due_date_raw };
    if (["exam", "test"].includes(a.type) && a.scope_source !== "stated")
      out.push({ kind: "Exam scope not stated", what: a.note && FLAG.test(a.note) ? a.note : "", ...base });
    else if (a.confidence && a.confidence !== "high")
      out.push({ kind: "Low confidence", what: a.note, ...base });
    else if (a.note && FLAG.test(a.note))
      out.push({ kind: "Worth confirming", what: a.note, ...base });
  }
  for (const r of D.schedule) {
    if ((r.confidence && r.confidence !== "high") || (r.note && FLAG.test(r.note)))
      out.push({ kind: "Schedule row", who: `${r.course} ${(r.topic || fmtShort(r.class_date)).slice(0, 90)}`, sub: courseName(r.course), code: r.course, weight: "", when: r.class_date, what: r.note,
        raw: [r.date_raw, r.reading_raw].filter(Boolean).join(" — ") });
  }
  for (const c of D.courses) {
    if (c.note && FLAG.test(c.note)) out.push({ kind: "Course detail", who: c.name, sub: "", code: c.code, weight: "", when: "", what: c.note, raw: "" });
    if (!c.textbook) out.push({ kind: "Textbook not named", who: c.name, sub: "", code: c.code, weight: "", when: "", what: "", raw: "" });
    if (!c.instructor) out.push({ kind: "Instructor not named", who: c.name, sub: "", code: c.code, weight: "", when: "", what: "", raw: "" });
  }
  return out;
}
const GROUP_NOTE = {
  "Exam scope not stated": "None of these syllabi say which chapters the assessment covers. One email to each professor settles the lot.",
  "Textbook not named": "The syllabus cites chapter numbers but never names the book. Check Blackboard or the Seneca bookstore before buying anything.",
  "Instructor not named": "No instructor is named in the syllabus.",
  "Low confidence": "The extractor could not read these rows cleanly. Check them against the PDF.",
  "Worth confirming": "Each of these carries a note from the extraction worth putting to the professor.",
  "Schedule row": "Rows where the syllabus itself is odd, ambiguous or self-contradictory.",
  "Course detail": "Course-level facts worth confirming.",
};
const GROUP_ORDER = ["Worth confirming", "Low confidence", "Schedule row", "Exam scope not stated", "Textbook not named", "Instructor not named", "Course detail"];

VIEWS.review = () => {
  const items = reviewItems();
  const groups = {};
  items.forEach((i) => (groups[i.kind] ||= []).push(i));
  let h = `<div class="pad" style="border-bottom:1px solid var(--line);background:var(--surf)"><p class="sub2" style="margin:0;max-width:78ch">Everything the syllabi left ambiguous, kept visible instead of quietly resolved.
    Budget one sitting to clear it, then record what you learn in <code>data/changes.md</code> with the authority you heard it from. A missing row looks exactly like a free week.</p></div>`;
  for (const kind of GROUP_ORDER) {
    const g = groups[kind];
    if (!g || !g.length) continue;
    const hasWeight = g.some((i) => i.weight), hasWhen = g.some((i) => i.when), hasWhat = g.some((i) => i.what), hasRaw = g.some((i) => i.raw);
    h += `<div class="month lbl">${esc(kind)} · ${g.length}</div>${GROUP_NOTE[kind] ? `<p class="quiet" style="padding:0 var(--secpad) 6px">${esc(GROUP_NOTE[kind])}</p>` : ""}
      <div class="scroll" style="padding:0 var(--secpad)"><table class="rtable revtable"><thead><tr><th scope="col" style="width:78px">Course</th><th scope="col">Item</th>
      ${hasWeight ? '<th scope="col" class="num" style="width:64px">Weight</th>' : ""}${hasWhen ? '<th scope="col" style="width:96px">When</th>' : ""}${hasWhat || hasRaw ? '<th scope="col">Detail</th>' : ""}</tr></thead><tbody>`;
    for (const i of g) {
      const item = i.who.replace(i.code, "").trim() || i.who;
      h += `<tr data-c="${esc(i.code)}"><td>${pill(i.code)}</td><td><b>${esc(item)}</b>${i.sub ? `<div class="quiet">${esc(i.sub)}</div>` : ""}</td>
        ${hasWeight ? `<td class="num" data-label="Weight">${i.weight ? i.weight + "%" : "—"}</td>` : ""}
        ${hasWhen ? `<td class="nowrap quiet" data-label="When">${i.when ? (i.prec && i.prec !== "exact" ? "wk of " : "") + fmtShort(i.when) : "—"}</td>` : ""}
        ${hasWhat || hasRaw ? `<td>${i.what ? esc(i.what) : ""}${i.raw ? `<details><summary>source text</summary><div class="raw">${esc(i.raw)}</div></details>` : ""}</td>` : ""}</tr>`;
    }
    h += `</tbody></table></div>`;
  }
  return h + `<div class="spacer"></div>`;
};

/* ============================================================ interactions */
async function setReading(id, next) {
  const j = await post("/api/progress", { reading_id: id, status: next || "not_started" });
  D.progress = j.progress;
}
document.addEventListener("click", async (e) => {
  const mb = e.target.closest("[data-master]");
  if (mb) {           /* every POST settles before one re-render, or the last write can lose the race */
    const ids = mb.dataset.master.split(",").filter(Boolean), to = mb.dataset.to;
    mb.disabled = true;
    try { for (const id of ids) await setReading(id, to); } finally { render(); }
    return;
  }
  const rb = e.target.closest("[data-reading]");
  if (rb) {
    const order = ["", "in_progress", "done"];
    await setReading(rb.dataset.reading, order[(order.indexOf(rb.dataset.s) + 1) % order.length]);
    render(); return;
  }
  const na = e.target.closest("[data-note]");
  if (na) { e.preventDefault(); openNote(na.dataset.note); return; }
  if (e.target.id === "wk-prev") { state.week = clampWeek(shownWeek() - 1); location.hash = `week/${state.week}`; return; }
  if (e.target.id === "wk-next") { state.week = clampWeek(shownWeek() + 1); location.hash = `week/${state.week}`; return; }
  if (e.target.id === "wk-today") { state.week = null; location.hash = "week"; render(); return; }
  if (e.target.id === "deadlines-only") { toggleDeadlinesOnly(); return; }
  if (e.target.id === "newnote") {
    const code = $("#newnote-course").value, rowId = $("#newnote-row").value;
    const row = D.schedule.find((r) => r.id === rowId);
    const j = await post("/api/note", { course: row ? row.course : code, title: row ? row.topic.split(/[.;:]/)[0].slice(0, 60) : "Notes",
      week_of: row ? row.class_date : D.today, chapter: row ? row.chapters.replace(/;/g, ", ") : "", topic: row ? row.topic : "" });
    await load(); state.view = "notes"; openNote(j.path); return;
  }
  if (e.target.id === "c-add") {
    const style = $("#c-style").value.trim();
    if (!style) { alert("Style of cause is required."); return; }
    if (!$("#c-course").value) { alert("Choose the course this case belongs to."); return; }
    const j = await post("/api/case", { style_of_cause: style, citation: $("#c-cite").value.trim(), canlii_url: $("#c-url").value.trim(),
      course: $("#c-course").value, status: "stub", verified: "no", week_of: D.today });
    D.cases = j.cases; render(); return;
  }
  const del = e.target.closest("[data-case-del]");
  if (del) { if (!confirm("Delete this case?")) return; const j = await post("/api/case", { id: del.dataset.caseDel, _delete: true }); D.cases = j.cases; render(); return; }
});
document.addEventListener("change", async (e) => {
  if (e.target.id === "csel") { state.course = e.target.value; location.hash = `courses/${e.target.value}`; return; }
  if (e.target.id === "newnote-course") { state.noteCourse = e.target.value; render(); return; }
  if (e.target.id === "tgt") { state.target = Number(e.target.value) || 70; render(); return; }
  const g = e.target.closest("[data-grade]");
  if (g) { const j = await post("/api/grade", { assessment_id: g.dataset.grade, earned_pct: g.value }); D.grades = j.grades; render(); return; }
  const cs = e.target.closest("[data-case-status]");
  if (cs) { const c = D.cases.find((x) => x.id === cs.dataset.caseStatus); const j = await post("/api/case", { ...c, status: cs.value }); D.cases = j.cases; return; }
  const cv = e.target.closest("[data-case-verified]");
  if (cv) { const c = D.cases.find((x) => x.id === cv.dataset.caseVerified); const j = await post("/api/case", { ...c, verified: cv.checked ? "yes" : "no" }); D.cases = j.cases; return; }
});
document.addEventListener("keydown", (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || "")) return;
  if (state.view !== "week") return;
  if (e.key === "[") { state.week = clampWeek(shownWeek() - 1); location.hash = `week/${state.week}`; }
  if (e.key === "]") { state.week = clampWeek(shownWeek() + 1); location.hash = `week/${state.week}`; }
});

load().catch((e) => {
  main.innerHTML = `<div class="empty"><div class="lead"><h2>Could not load data</h2><p>${esc(e.message)}</p><p class="quiet">Is <code>python serve.py</code> still running?</p></div></div>`;
});
