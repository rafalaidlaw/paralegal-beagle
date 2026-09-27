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
/* Classes run Monday to Friday, so once Friday is over the week Rafael is
   standing in has nothing left to prepare for. From Saturday morning the app
   rolls forward: "this week" becomes the week ahead, which is the one worth
   reading for (his request, 26 Sep 2026 -- a Saturday, wanting week 4).

   The roll is deliberately everywhere, not only on This Week: the sidebar, the
   Weekly Calendar's ruled row, the runway marker and the reading backlog all
   move together, because a screen that called week 3 current while another
   called week 4 current would be worse than either. The sidebar says which of
   the two it is doing -- "Current week" or "Week ahead" -- so the number is
   never quietly wrong. */
const rolledForward = () => { const d = toDate(today()).getDay(); return d === 0 || d === 6; };
const nowWeek = () => clampWeek(termWeek(today()) + (rolledForward() ? 1 : 0));
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
/* A course code. It links into Courses when that screen is shown; when it is
   not, it is the same chip without the link -- never a link to nowhere. */
const pill = (code) => isShown("courses")
  ? `<a class="course-pill" data-c="${esc(code)}" href="#courses/${esc(code)}" title="${esc(courseName(code))}">${esc(code)}</a>`
  : `<span class="course-pill" data-c="${esc(code)}" title="${esc(courseName(code))}">${esc(code)}</span>`;
const typeWord = (t) => `<span class="type ${esc(t)}">${esc(t)}</span>`;

/* LGL154's syllabus really does print "Assignment # 1" and "In-Class Test # 1"
   with a space, and data/*.csv keeps it that way -- every figure in this app
   has to trace back to a page of the PDF, so the CSV is not the place to tidy
   punctuation. Rafael reads it as "#1", so the gap is closed HERE, at the last
   moment before it is drawn.

   nm() is esc() plus that one repair, for a NAME. Deliberately not applied to
   the Review tab's "source text" blocks: those are shown as verbatim proof of
   what the syllabus says, and tidying them would be a small lie. */
const tidyHash = (s) => String(s ?? "").replace(/#\s+(?=\d)/g, "#");
const nm = (s) => esc(tidyHash(s));

/* Column order in the Weekly Calendar: the order Rafael meets his courses in
   the week, which is how he reads across a row (24 Sep 2026). It is a
   preference, not a fact from the syllabi, so it lives here and not in
   data/courses.csv -- that file stays alphabetical, which is what makes it
   readable beside validate.py's output.

   It is his order, not the clock's: by meeting time Administrative Law is
   sixth (Wed 5:10pm), and he asked for it first. Do not "correct" it.

   A course missing from this list still appears, at the end. A column that
   silently vanished would look exactly like a course with nothing due -- the
   failure this whole project is built to avoid. */
const WEEK_ORDER = ["LGL156", "LGL151", "LGL250", "LGL225", "LGL154", "LGL160", "LGL152", "LGL153"];
const rank = (code) => { const i = WEEK_ORDER.indexOf(code); return i < 0 ? WEEK_ORDER.length : i; };
const byWeekOrder = (codes) => [...codes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

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
/* date_precision "unknown" resolves to no date at all, so every view that asks
   "when" has to have an answer ready. Without this the Courses screen printed
   "week of " and "in NaN days" -- which is worse than no date, because it looks
   like a date the app failed to fetch rather than one nobody has given yet. */
function whenLabel(a) {
  if (!a.due_resolved) return "date not set";
  return a.date_precision === "exact" ? fmt(a.due_resolved) : `week of ${fmtShort(a.due_resolved)}`;
}
/* Same honesty as the Upcoming cards: once a week-dated item's Monday has
   gone, "this week" names the wrong week -- the app may already have rolled
   into the next one. Count to the day its window shuts instead. */
function relLabel(a) {
  if (!a.due_resolved) return "still to be announced";
  const lo = dMin(a), hi = dMax(a);
  if (hi < 0) return `${Math.abs(hi)} days ago`;
  if (lo <= 0) {
    if (a.date_precision === "exact") return "today";
    return hi === 0 ? "last day" : `${hi} day${hi === 1 ? "" : "s"} left`;
  }
  if (lo === 1) return "tomorrow";
  return `in ${lo} days`;
}
const weightLabel = (a) => a.weight_pct ? `worth ${a.weight_pct}% of the course` : "no separate weight";

/* The big number on an Upcoming card, and the word under it.

   Three cases, and the middle one is why this exists: a week-precision item
   whose Monday has passed is not "this week" any more once Upcoming has rolled
   into the next one -- it is an item with a day or two left before its window
   shuts. Count to dMax there, which is the only honest number left. */
function countdown(a) {
  if (dMin(a) > 0) { const d = daysLeft(a); return { n: String(d), word: `day${d === 1 ? "" : "s"}` }; }
  if (a.date_precision === "exact") return { n: "now", word: "today" };
  const left = dMax(a);
  if (left <= 0) return { n: "now", word: "last day" };
  return { n: String(left), word: left === 1 ? "day left" : "days left" };
}

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
/* "Show deadlines only" was switched off on 26 Sep 2026: the chapter runs are
   the reason to open the Weekly Calendar, so a button that hid them had nothing
   to offer. DL_ONLY is checked FIRST on purpose -- a switch left on in
   localStorage before today must not go on hiding the readings. To bring the
   button back, set this to true and restore the block in VIEWS.grid. */
const DL_ONLY = false;
const isDeadlinesOnly = () => DL_ONLY && LS.get("beagle-deadlines-only") === "1";
function toggleDeadlinesOnly() { LS.set("beagle-deadlines-only", isDeadlinesOnly() ? "" : "1"); render(); }

/* The line at the bottom of the sidebar. It changes with the date and cycles,
   so the same day always shows the same one -- nothing random, because a line
   that flickered on every re-render would be noise rather than a note.

   Kept short and level. Nothing that congratulates him for existing, nothing
   with three exclamation marks, nothing that pretends a 40% midterm is fun.
   Edit the list freely: it is just strings, and the length can be anything. */
const PEP = [
  "You can do it.",
  "This is easy.",
  "One chapter at a time.",
  "Start with the hardest one.",
  "Two pages beats zero.",
  "The hard part is starting.",
  "Twenty minutes counts.",
  "Done beats perfect.",
  "Slow is fine. Stopping isn't.",
  "Pick one thing. Begin.",
  "Momentum, not motivation.",
  "You've handled harder.",
  "Write it down, it sticks.",
  "Read it once, then explain it.",
  "Confusion is the first draft.",
  "Ask the question in class.",
  "You know more than last week.",
  "Make the note now.",
  "It gets familiar fast.",
  "Close the tabs. Open the book.",
  "Show up. That's most of it.",
  "Future you is grateful.",
  "Small and steady wins this.",
  "Curiosity beats cramming.",
  "Trust the schedule.",
  "You're further along than it feels.",
  "Keep the streak.",
  "The reading is the work.",
];
/* Indexed by the day, not by chance: same day, same line. */
function pepToday() {
  const n = daysBetween(D.term.week1_monday, today());
  return PEP[((n % PEP.length) + PEP.length) % PEP.length];
}
/* Class meetings still ahead, today's included. Study-week rows are not
   classes, and never were -- they are the two-per-course markers the syllabi
   print for the break. */
function classesLeft() {
  return D.schedule.filter((r) => r.due_type !== "study_week" && r.class_date >= today()).length;
}

/* ------------------------------------------------------------ chrome */
const VIEW_META = {
  week: ["Upcoming", () => weekSubtitle()],
  deadlines: ["Deadlines", () => ""],
  grid: ["Weekly Calendar", () => ""],
  timetable: ["Timetable", () => {
    /* No standing subtitle since 26 Sep 2026 -- "Your week, hour by hour" only
       described the chart directly beneath it. The warning stays: it fires
       when a row is low confidence, and none is today, so this reads empty. */
    const n = D.timetable.filter((t) => t.confidence === "low").length;
    return n ? `${cap(words(n))} block${n === 1 ? "" : "s"} still to confirm.` : "";
  }],
  crunch: ["Crunch", () => crunchSubtitle()],
  courses: ["Courses", () => "Per-course syllabus, standing and schedule."],
  notes: ["Notes", () => "Reading notes in Markdown, indexed per class meeting."],
  cases: ["Cases", () => "Case briefs with McGill-style citations and CanLII links."],
  review: ["Review", () => `${cap(words(reviewItems().length))} open question${reviewItems().length === 1 ? "" : "s"} the syllabi left ambiguous.`],
};

/* The screen is called Upcoming, so the sentence leads with what is next --
   the nearest thing still ahead of him, not a count of chapters. An item drops
   out of "next" the moment it can no longer be met: an exact date once that day
   has passed, a week-precision item once its whole week has run out (dMax, the
   two-horizon rule). So this sentence re-points itself. */
function weekSubtitle() {
  const wk = shownWeek();
  const reads = D.readings.filter((r) => r.week_no === wk);
  const nCourses = new Set(reads.map((r) => r.course)).size;
  const next = dueSorted().find((a) => !isOverdue(a));
  const chapters = reads.length
    ? `${words(reads.length)} chapter${reads.length === 1 ? "" : "s"} across ${words(nCourses)} course${nCourses === 1 ? "" : "s"}`
    : `no chapters assigned`;
  if (!next) return `Nothing graded left in the term, and ${chapters} in week ${wk}.`;
  const n = daysLeft(next);
  const when = n > 0
    ? (n === 1 ? "tomorrow" : `in ${words(n)} days`)
    : next.date_precision === "exact" ? "today"
    : dMax(next) <= 0 ? "on its last day" : `by ${fmt(lastPossible(next))}`;
  return `Next up: ${tidyHash(next.name)} for ${next.course} ${when}. Week ${wk} has ${chapters}.`;
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
    timetable: new Set(D.timetable.map((t) => t.course)).size,
    crunch: crunchWeeks().filter((x) => x.load >= HEAVY).length,
    courses: D.courses.length,
    notes: D.notes.length,
    cases: D.cases.length,
    review: reviewItems().length,
  };
}

function paintChrome() {
  const wk = nowWeek(), last = LAST_WEEK();
  const ahead = rolledForward();
  $("#wk-big").textContent = String(wk).padStart(2, "0");
  $("#wk-of").textContent = `of ${last}`;
  $("#wk-lbl").textContent = ahead ? "Week ahead" : "Current week";
  $("#wk-range").textContent = ahead
    ? `Starts Mon ${fmtShort(weekMonday(wk))}`
    : `Mon ${fmtShort(weekMonday(wk))} — Sun ${fmtShort(plus(weekMonday(wk), 6))}`;
  const c = counts();
  document.querySelectorAll("[data-count]").forEach((el) => { el.textContent = c[el.dataset.count] ?? ""; });
  document.querySelectorAll("#nav a[data-view]").forEach((a) => a.classList.toggle("on", a.dataset.view === state.view));
  const [title, sub] = VIEW_META[state.view] || VIEW_META.week;
  $("#vtitle").textContent = title;
  $("#vsub").textContent = sub();
  $("#todaychip").textContent = fmtLong(today());
  const left = classesLeft();
  $("#footstats").innerHTML = left
    ? `<b>${left}</b> <span class="lbl">Class${left === 1 ? "" : "es"} to go</span><div class="pep">${esc(pepToday())}</div>`
    : `<span class="lbl">Term over</span><div class="pep">${esc(pepToday())}</div>`;
  const tb = $("#theme"); if (tb) tb.textContent = THEME_LABEL[currentTheme()];
}

/* ------------------------------------------------------------ router */
const VIEWS = {};

/* THE THREE SCREENS. Rafael cut the app to This Week, Deadlines and the
   Weekly Calendar
   on 24 Sep 2026. The other five -- Crunch, Courses, Notes, Cases, Review --
   are still built and still work; they are simply not listed in the sidebar
   and not routable. To bring one back: add its name to this list and
   un-comment its line in index.html's <nav>. Nothing else.

   Their code is NOT commented out, on purpose. This Week's term runway calls
   crunchWeeks() from the Crunch section and the page header calls
   reviewItems(), so commenting those blocks out would break the screens he
   kept. One list is also one thing to change back, instead of five. */
/* Sidebar order, top to bottom. The Weekly Calendar leads because it is how
   Rafael navigates the term (his call, 26 Sep 2026); the app still OPENS on
   Upcoming, which is a separate thing -- see state.view. */
const SHOWN = ["grid", "week", "timetable"];
const isShown = (v) => SHOWN.includes(v);

/* The route stays #grid so old bookmarks keep working; #calendar matches the
   name it is shown under, and #exams predates the Deadlines rename. */
const ALIAS = { exams: "deadlines", calendar: "grid", upcoming: "week" };
let renderedView = null;
/* Re-rendering replaces the whole view, so the scroll position has to be put
   back on purpose. A change of SCREEN goes to the top; a tick, a mark, a
   target change or a week step re-renders in place and stays where you were. */
function render() {
  paintChrome();
  const y = window.scrollY;
  const x = $(".gridwrap")?.scrollLeft || 0;     /* the Weekly Calendar scrolls sideways below 1338px */
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
  /* An old bookmark to a screen that is no longer shown (#courses/LGL225)
     lands on This Week rather than a blank page. */
  if (!isShown(v)) { state.view = "week"; return; }
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
  let h = "";

  /* ---- week stepper ---------------------------------------------- */
  h += `<div class="gtools"><span class="wknav">
    <button id="wk-prev" class="ghost" ${wk <= 1 ? "disabled" : ""} title="Previous week ( [ )">‹ ${wk > 1 ? "week " + (wk - 1) : "week"}</button>
    <b>Week ${wk} of ${last}</b>
    <button id="wk-next" class="ghost" ${wk >= last ? "disabled" : ""} title="Next week ( ] )">${wk < last ? "week " + (wk + 1) : "week"} ›</button></span>
    <span class="quiet">${fmt(weekMonday(wk))} – ${fmt(plus(weekMonday(wk), 6))}</span>
    ${wk !== nowWk
      ? `<button id="wk-today" class="ghost">back to ${rolledForward() ? "the week ahead" : "this week"}</button>`
      : `<span class="quiet">${rolledForward() ? "the week ahead — this week's classes are done" : "this week"}</span>`}
    ${holidayNote(wk)}
  </div>`;

  /* ---- what lands in the week this screen is showing --------------- */
  /* The horizon is the five business days of that week, Monday to Friday --
     Rafael, 26 Sep 2026 -- not a rolling 7 or 14 days from today. A rolling
     window slides against the thing he is actually planning: on a Friday it
     reached halfway into the week after, and on a Monday it stopped short of
     the Friday he was preparing for. Selecting by week_no also makes this
     screen and the Weekly Calendar agree by construction, because the Calendar
     places items by that same number. That agreement is exactly what caught
     the week-window bug, and it is worth keeping true on purpose. */
  const inWeek = dueSorted().filter((a) => a.week_no === wk && !isOverdue(a));
  const beyond = dueSorted().find((a) => !isOverdue(a) && a.week_no > wk);
  const three = inWeek.slice(0, 3);
  h += `<section class="sec"><span class="lbl">${inWeek.length
      ? `${cap(words(inWeek.length))} due in week ${wk} — ${weekRange(wk)}`
      : `Nothing graded in week ${wk} — ${weekRange(wk)}`}</span>
    <div class="cards">${three.map((a, n) => {
      const c = countdown(a);
      return `<div class="card ${n === 0 ? "next" : ""}" data-c="${esc(a.course)}">
        <div class="days"><b>${c.n}</b><span>${c.word}</span></div>
        <div class="who">${pill(a.course)} ${typeWord(a.type)}</div>
        <div class="name">${nm(a.name)}</div>
        <div class="course">${esc(courseName(a.course))}</div>
        <div class="when">${whenLabel(a)} · ${weightLabel(a)}</div>
      </div>`;
    }).join("") || `<div class="card quiet-week"><div class="name">Nothing graded this week</div>
      <div class="when">${beyond
        ? `Next is ${esc(beyond.course)} ${nm(beyond.name)}, ${whenLabel(beyond)}. Step forward to see it.`
        : "Every dated item in the syllabi has passed."}</div></div>`}</div>
  </section>`;

  /* The rest of the same week, in full. The three cards carry the nearest
     items large; this carries everything else, because a screen called Upcoming
     that hides a 30% test six days out is not doing its job (Rafael caught
     exactly that on 26 Sep 2026). Nothing is summarised into a count here --
     that count was the hiding place. */
  const rest = inWeek.slice(3);
  if (rest.length) {
    const dlOn = isShown("deadlines");
    h += `<section class="sec"><span class="lbl">Also in week ${wk}</span>
      <div class="upnext">${rest.map((a) => `<${dlOn ? "a" : "div"} class="uprow" ${dlOn ? `href="#deadlines"` : ""} data-c="${esc(a.course)}">
        <span class="when"><b>${daysLeft(a)}</b> ${daysLeft(a) === 1 ? "day" : "days"}</span>
        <span class="what"><b>${nm(a.name)}</b><span class="course">${esc(a.course)} · ${esc(courseName(a.course))}</span></span>
        <span class="tag ${esc(a.type)}">${esc(a.type)}</span>
        <span class="date">${whenLabel(a)}</span>
        <span class="wt">${a.weight_pct ? a.weight_pct + "%" : "—"}</span></${dlOn ? "a" : "div"}>`).join("")}</div>
      <div class="note">${dlOn
        ? `<a href="#deadlines">See every deadline</a> for the rest of the term.`
        : `Looking further ahead? Step to the next week, or the <a href="#grid">Weekly Calendar</a> has the whole term at once.`}</div>
    </section>`;
  }

  /* The "Already happened" callout stood here until 26 Sep 2026. This screen
     is about what is next, and a list of what Rafael has already sat was the
     one thing on it he could do nothing about. Nothing is lost: those items are
     still in the Weekly Calendar, and a passed deadline still greys itself
     wherever a deadline row is drawn. To restore: put back const gm =
     gradeMap() at the top of this view -- it was read by nothing else, so it no
     longer runs -- and list
     dueSorted().filter((a) => isOverdue(a) && !gm[a.id]?.earned_pct)
     in a .callout here, keeping the note that a week-dated item is not late
     while its own week is still running. */

  /* ---- the week band: items the syllabus dates only to a week ------ */
  const band = D.assessments.filter((a) => a.week_no === wk && a.date_precision !== "exact");
  if (band.length) {
    h += `<div class="weekband" style="margin-top:16px"><span class="lbl">The syllabus gives a week, not a day</span>
      ${band.map((a) => `<div class="wbrow">${pill(a.course)} ${typeWord(a.type)} <b>${nm(a.name)}</b>
        <span class="quiet">${esc(courseName(a.course))}</span>
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
        ${m.topic && !sameText(m.topic, m.due_item) ? `<p class="topic">${nm(m.topic)}</p>` : ""}
        ${m.due_item ? `<div style="margin:0 0 10px"><span class="tag ${esc(m.due_type)}">${nm(m.due_item)}</span></div>` : ""}
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
    h += `<a class="runway ${cls}" href="#week/${x.w}" title="${esc(x.isBreak ? "Study week" : x.load ? x.items.map((a) => `${a.course} ${tidyHash(a.name)} ${a.weight_pct}%`).join("; ") : "nothing due")}">
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
/* SWITCHED OFF on 26 Sep 2026 at Rafael's request -- the numbers were adding
   a line to every class without telling him anything he could act on, since no
   syllabus gives the wording behind a number. The data is untouched: lso_nums
   is still in data/schedule.csv, still exported to the wiki's context/ files.
   Set SHOW_LSO back to true and every line returns, on all three screens. */
const SHOW_LSO = false;
function lsoLine(r, short) {
  if (!SHOW_LSO || !r.lso_nums) return "";
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
  const nextUp = items.find((a) => !isOverdue(a));
  /* The standing note about unstated scope was removed on 26 Sep 2026: it sat
     above every visit to say the same thing, and each row that lacks a scope
     already says "not stated -- ask" on its own face, where it is actually
     about that item. */
  let h = "";
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
    <div class="dbody" style="min-width:0"><h3>${nm(a.name)}</h3><div class="course">${esc(courseName(a.course))}</div>
      <div class="scope">${scopeLine(a)}</div>${meta ? `<div class="scope quiet">${esc(meta)}</div>` : ""}</div>
    <div class="when"><b>${whenLabel(a)}</b><div>${relLabel(a)}</div></div>
    <div class="weight">${extra || `<b>${a.weight_pct ? a.weight_pct + "%" : "—"}</b><span>${a.weight_pct ? "of course" : "no weight"}</span>`}</div>
  </article>`;
}

/* ==================================================================== GRID */
VIEWS.grid = () => {
  const codes = byWeekOrder(D.courses.map((c) => c.code));
  const prog = progressMap();
  const nowWk = nowWeek(), last = LAST_WEEK();
  /* The "show deadlines only" button stood here in a .gtools band until
     26 Sep 2026. To restore it, set DL_ONLY = true above and put back a .gtools
     div holding a button with id="deadlines-only", aria-pressed bound to
     isDeadlinesOnly(), reading "showing deadlines only" when it is on. */
  let h = `<div class="gridwrap"><div class="grid ${isDeadlinesOnly() ? "deadlines-only" : ""}">
    <div class="grow head"><div class="gwk lbl">Week</div>${codes.map((c) => `<div class="gcell">
      <div class="short">${esc(courseName(c))}</div>
      ${isShown("courses")
        ? `<a class="code" href="#courses/${esc(c)}" style="text-decoration:none;color:inherit">${esc(c)}</a>`
        : `<span class="code">${esc(c)}</span>`}</div>`).join("")}</div>`;
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
      let cell = dues.map((a) => `<div><span class="tag ${esc(a.type)}">${nm(a.name)}${weightTag(a) ? ` <b>${weightTag(a)}</b>` : ""}</span>
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
  /* No key beneath the calendar since 26 Sep 2026 -- with the course colours
     gone there is nothing left to explain. To restore, set the coloured
     border-top back in app.css and put legend() back into this return. */
  return h + `</div></div><div class="spacer"></div>`;
};

function legend() {
  const on = isShown("courses");
  const ordered = byWeekOrder(D.courses.map((c) => c.code)).map((code) => course(code));
  return `<div class="legend">${ordered.map((c) => {
    const body = `<span class="dot"></span><span class="code">${esc(c.code)}</span>`;
    return on
      ? `<a href="#courses/${esc(c.code)}" data-c="${esc(c.code)}" title="${esc(c.name)}">${body}</a>`
      : `<span class="leg" data-c="${esc(c.code)}" title="${esc(c.name)}">${body}</span>`;
  }).join("")}</div>`;
}

/* =============================================================== TIMETABLE */
/* Rafael's Block NF timetable drawn to scale: five day columns, one block per
   class, placed by the clock. Its data is data/timetable.csv, transcribed from
   a picture of his own timetable -- NOT derived from the syllabi, and it
   contradicts three of them. So every block carries where its times came from,
   and an unconfirmed one is drawn dashed: absence, not alarm, the same way an
   unstated exam scope is drawn. */
const TT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const mins = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + m; };
const hhmm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const clock = (t) => {
  const n = mins(t), h = Math.floor(n / 60), m = n % 60;
  return `${h % 12 === 0 ? 12 : h % 12}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
};
const durWords = (a, b) => {
  if (!b) return "—";
  const n = mins(b) - mins(a), h = Math.floor(n / 60), m = n % 60;
  return `${h ? h + "h" : ""}${h && m ? " " : ""}${m ? m + "m" : ""}`;
};
/* Rafael's enrolment listing gives the start of each class and its room, but
   never the end. Six of eleven blocks therefore have no end time anywhere --
   not in the listing, and not in a syllabus, because three of those courses'
   syllabi describe a different section. An open block is DRAWN 45 minutes tall
   so the chart has something to show, and says so: the bottom edge is dashed
   and the time reads "11:40am –". The 45 is a drawing decision, never a claim
   about the class, and nothing is computed from it. */
const OPEN_DRAW_MIN = 45;
/* "Newnham Bldg A - A4519" -> "A4519". The chart has one line to spare on a
   short block and the room is the part he needs walking across campus; the
   full string stays in the table and the tooltip. */
const shortRoom = (room) => String(room || "").replace(/^.*?-\s*/, "").trim();
const ends = (t) => (t.end ? mins(t.end) : mins(t.start) + OPEN_DRAW_MIN);

VIEWS.timetable = () => {
  const tt = D.timetable.slice();
  if (!tt.length) {
    return `<div class="empty"><div class="lead"><h2>No timetable yet</h2>
      <p>Add rows to <code>data/timetable.csv</code> and refresh.</p></div></div>`;
  }
  /* The chart runs from the first class of the week to the last, rounded out to
     the hour, so no empty band is drawn above or below. */
  const from = Math.floor(Math.min(...tt.map((t) => mins(t.start))) / 60) * 60;
  const to = Math.ceil(Math.max(...tt.map(ends)) / 60) * 60;
  const span = to - from;
  const pos = (t) => ((mins(t) - from) / span * 100).toFixed(3);
  const hours = [];
  for (let m = from; m <= to; m += 60) hours.push(m);

  /* Only the days with a class in them. Monday is empty this term and a
     hatched column with "no class" in it was width spent on nothing (Rafael,
     26 Sep 2026). Derived rather than hardcoded to Tue-Fri, so the column
     comes back by itself the day a Monday class appears in the data -- and the
     stat below still names the clear days, which is worth knowing. */
  const days = TT_DAYS.filter((d) => tt.some((t) => t.day === d));
  const open = tt.filter((t) => !t.end);

  /* The stats strip stood here until 26 Sep 2026: classes a week, heaviest
     day, clear days, hours in class. Every one of them was countable off the
     chart below in about a second, and they pushed the chart itself under the
     fold. The chart is the screen. If a figure ever earns its place back, it
     belongs beside the thing it counts, not in a band above it. */
  let h = `<div class="ttwrap"><div class="tt" style="--cols:${days.length}">
    <div class="ttrow tthead"><div class="ttgut"></div>${days.map((d) =>
      `<div class="ttday">${d}</div>`).join("")}</div>
    <div class="ttrow ttbody">
      <div class="ttgut">${hours.map((m) =>
        `<span class="tthr" style="top:${pos(hhmm(m))}%">${clock(hhmm(m))}</span>`).join("")}</div>
      ${days.map((d) => {
        const blocks = tt.filter((t) => t.day === d).sort((a, b) => mins(a.start) - mins(b.start));
        return `<div class="ttcol">
          ${hours.slice(1, -1).map((m) => `<span class="ttline" style="top:${pos(hhmm(m))}%"></span>`).join("")}
          ${blocks.map((t) => {
            const soft = !t.end;
            const where = t.room ? esc(shortRoom(t.room)) : t.mode ? esc(t.mode) : "";
            /* Under an hour there is no room for three lines: the block goes to
               one, and the tooltip still carries the room. */
            const short = ends(t) - mins(t.start) < 60;
            return `<a class="ttblock${soft ? " open" : ""}${short ? " short" : ""}" data-c="${esc(t.course)}" href="#grid"
              style="top:${pos(t.start)}%;height:${((ends(t) - mins(t.start)) / span * 100).toFixed(3)}%"
              title="${esc(`${courseName(t.course)} — starts ${clock(t.start)}${t.end ? `, ends ${clock(t.end)}` : ", end time not stated in your enrolment"}${t.room ? " · " + t.room : ""}${t.mode ? " · " + t.mode : ""}`)}">
              <span class="code">${esc(t.course)}</span>
              <span class="when">${clock(t.start)}${t.end ? "–" + clock(t.end) : " –"}</span>
              ${where ? `<span class="where">${where}</span>` : ""}</a>`;
          }).join("")}
        </div>`;
      }).join("")}
    </div></div></div>`;

  if (open.length) {
    h += `<p class="quiet" style="padding:8px var(--secpad) 0;max-width:74ch">A block with a dashed foot is one your class listing
      gives a start time for but no finish — ${words(open.length)} of them. Those are drawn ${OPEN_DRAW_MIN} minutes tall so there is
      something to see; that height is a drawing decision, not a claim about how long the class runs.</p>`;
  }
  return h + `${legend()}<div class="spacer"></div>`;
};

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
      <div class="bars" title="${esc(x.isBreak ? "Study week" : x.load ? x.items.map((a) => `${a.course} ${tidyHash(a.name)} ${a.weight_pct}%`).join("; ") : "nothing due")}">
        <span class="flat" style="--flat:${(flat / max * 100).toFixed(2)}%"></span>
        <span style="display:flex;width:${(x.load / max * 100).toFixed(2)}%">${x.items.filter((a) => Number(a.weight_pct) > 0).map((a) =>
          `<span class="seg" data-c="${esc(a.course)}" style="--v:${Number(a.weight_pct)}" title="${esc(a.course + " " + tidyHash(a.name) + " " + a.weight_pct + "%")}"></span>`).join("")}</span>
      </div>
      <div class="pct">${x.load ? x.load + "%" : x.isBreak ? "—" : "0"}</div></div>`;
    if (x.items.length) h += `<div class="citems">${x.items.map((a) =>
      `<span class="citem ${esc(a.type)}" data-c="${esc(a.course)}"><span class="code">${esc(a.course)}</span><span>${nm(a.name)}</span>${weightTag(a) ? `<span style="font-weight:800">${weightTag(a)}</span>` : ""}</span>`).join("")}</div>`;
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
      `<b>${a.weight_pct ? a.weight_pct + "%" : "—"}</b><span style="margin-top:8px"><input class="mark" type="number" min="0" max="100" step="0.1" data-grade="${esc(a.id)}" value="${esc(g.earned_pct || "")}" placeholder="mark" aria-label="Mark for ${nm(a.name)}, percent"></span>${g.returned_date ? `<span>returned ${esc(g.returned_date)}</span>` : ""}`);
  }

  h += `<div class="sechead" style="border-top:2px solid var(--rule);margin-top:12px"><h2>Schedule and readings</h2></div>`;
  for (const r of D.schedule.filter((x) => x.course === code)) {
    const isBreak = r.due_type === "study_week";
    const rd = D.readings.filter((x) => x.schedule_id === r.id);
    h += `<article class="rrow ${r.week_no === nowWeek() ? "now" : ""}" data-c="${esc(code)}">
      <div class="key"><div class="code" style="font-family:var(--sans);font-size:13px">${fmt(r.class_date)}</div><div class="wk">week ${r.week_no}</div></div>
      <div style="min-width:0">
        ${isBreak ? `<span class="tag">study week</span>` : (sameText(r.topic, r.due_item) ? "" : `<p class="topic" style="margin-top:0;color:var(--ink)">${nm(r.topic)}</p>`)}
        ${r.note ? `<div class="meta" style="margin-bottom:8px">${esc(r.note)}</div>` : ""}
        <div class="chips">${rd.map((x) => chapterChip(x, prog[x.id])).join("")}
          ${!rd.length && r.reading_raw ? `<span class="quiet">${esc(r.reading_raw)}</span>` : ""}
          ${r.due_item ? `<span class="tag ${esc(r.due_type)}">${nm(r.due_item)}</span>` : ""}</div>
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
    const base = { who: `${a.course} ${tidyHash(a.name)}`, sub: courseName(a.course), code: a.course, weight: a.weight_pct, when: a.due_resolved, prec: a.date_precision, raw: a.due_date_raw };
    if (["exam", "test"].includes(a.type) && a.scope_source !== "stated")
      out.push({ kind: "Exam scope not stated", what: a.note && FLAG.test(a.note) ? a.note : "", ...base });
    else if (a.confidence && a.confidence !== "high")
      out.push({ kind: "Low confidence", what: a.note, ...base });
    else if (a.note && FLAG.test(a.note))
      out.push({ kind: "Worth confirming", what: a.note, ...base });
  }
  for (const r of D.schedule) {
    if ((r.confidence && r.confidence !== "high") || (r.note && FLAG.test(r.note)))
      out.push({ kind: "Schedule row", who: `${r.course} ${tidyHash((r.topic || fmtShort(r.class_date)).slice(0, 90))}`, sub: courseName(r.course), code: r.course, weight: "", when: r.class_date, what: r.note,
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
  // no #deadlines-only button since 26 Sep 2026; kept for the restore
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
