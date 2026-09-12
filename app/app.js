/* Paralegal Beagle - all views. Vanilla JS, no framework, no CDN.
   data/*.csv is the source of truth; everything here is derived on each render. */

let D = null;
const state = { view: "week", course: null, notePath: null, target: 70, gridCourse: null };

const $ = (s, r = document) => r.querySelector(s);
const main = $("#main");

/* ------------------------------------------------------------ utilities */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const toDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const fmt = (iso) => { if (!iso) return ""; const x = toDate(iso); return `${DOW[x.getDay()]} ${x.getDate()} ${MON[x.getMonth()]}`; };
const fmtShort = (iso) => { if (!iso) return ""; const x = toDate(iso); return `${x.getDate()} ${MON[x.getMonth()]}`; };

function daysBetween(a, b) {
  return Math.round((toDate(b) - toDate(a)) / 86400000);
}
const today = () => D.today;
const termWeek = (iso) => Math.floor(daysBetween(D.term.week1_monday, iso) / 7) + 1;
function weekMonday(n) {
  const m = toDate(D.term.week1_monday);
  m.setDate(m.getDate() + (n - 1) * 7);
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}
const LAST_WEEK = () => termWeek(D.term.end);

const progressMap = () => Object.fromEntries(D.progress.map((p) => [p.reading_id, p]));
const gradeMap = () => Object.fromEntries(D.grades.map((g) => [g.assessment_id, g]));
const courseName = (code) => (D.courses.find((c) => c.code === code) || {}).name || code;

/* A bare code is ambiguous when you are carrying eight of them, especially the
   ones that differ by a digit. The pill stays for scanning; the title follows. */
const courseTag = (code) =>
  `<span class="course-pill">${esc(code)}</span> <span class="course-title">${esc(courseName(code))}</span>`;

function startBy(a) {
  if (!a.due_resolved) return "";
  const d = toDate(a.due_resolved);
  d.setDate(d.getDate() - Number(a.lead_days || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Assessments sorted by the date we actually resolved, soonest first. */
function dueSorted() {
  return D.assessments.filter((a) => a.due_resolved)
    .slice().sort((a, b) => a.due_resolved.localeCompare(b.due_resolved) || a.course.localeCompare(b.course));
}

/* The date itself is rendered "wk of 14 Sep" when we only know the week, so the
   precision is already visible; this just explains it on hover. */
function whenCell(a, long) {
  const d = long ? fmt(a.due_resolved) : fmtShort(a.due_resolved);
  if (a.date_precision === "exact") return long ? fmt(a.due_resolved) : d;
  return `<span title="The syllabus gives only a week, not a day. Syllabus says: ${esc(a.due_date_raw)}">${long ? "week of " : "wk of "}${d}</span>`;
}

/* ------------------------------------------------------------ networking */
async function load() {
  const r = await fetch("/api/data");
  D = await r.json();
  viewFromHash();
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
  $("#termline").textContent =
    `Seneca Polytechnic · Paralegal Accelerated (PLEA) · Fall 2026 · ${fmt(D.term.start)} to ${fmt(D.term.end)}`;
  $("#todaychip").textContent =
    wk < 1 ? "before term" : wk > last ? "term over" : `Week ${wk} of ${last} · ${fmt(today())}`;
  $("#footstats").textContent =
    `${D.courses.length} courses · ${D.schedule.length} class meetings · ${D.assessments.length} assessments · ${D.readings.length} chapter-readings`;
  const n = reviewItems().length;
  $("#reviewcount").textContent = n || "";
  $("#reviewcount").style.display = n ? "" : "none";
}

/* ------------------------------------------------------------ router */
const VIEWS = {};
function render() {
  document.querySelectorAll("#tabs button").forEach((b) =>
    b.classList.toggle("on", b.dataset.view === state.view));
  main.innerHTML = VIEWS[state.view]();
  main.scrollTop = 0;
}

$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]");
  if (!b) return;
  state.view = b.dataset.view;
  location.hash = b.dataset.view;          // bookmarkable, and Back works
  render();
});

/* Restore the tab from the URL, so a bookmark to #exams lands on Exams. */
function viewFromHash() {
  const v = (location.hash || "").replace(/^#/, "");
  if (v && VIEWS[v]) state.view = v;
}
window.addEventListener("hashchange", () => { viewFromHash(); render(); });
$("#reload").addEventListener("click", load);

/* ==================================================================== WEEK */
VIEWS.week = () => {
  const wk = termWeek(today());
  const prog = progressMap();
  let h = "";

  // -- anything genuinely urgent gets said first, before any table.
  const urgent = dueSorted().filter((a) => {
    const n = daysBetween(today(), a.due_resolved);
    return n >= 0 && n <= 10 && Number(a.weight_pct || 0) >= 10;
  });
  for (const a of urgent) {
    const n = daysBetween(today(), a.due_resolved);
    h += `<div class="callout ${n <= 4 ? "hot" : "warn"}">
      <b>${esc(a.course)} ${esc(a.name)}</b>
      <span class="course-title">— ${esc(courseName(a.course))}</span><br>
      ${a.weight_pct}% of the course —
      ${n === 0 ? "<b>today</b>" : n === 1 ? "<b>tomorrow</b>" : `in <b>${n} days</b>`}
      (${a.date_precision === "exact" ? fmt(a.due_resolved) : "week of " + fmt(a.due_resolved)}).
      ${a.scope_chapters ? `Covers chapters ${esc(a.scope_chapters.replace(/;/g, ", "))}.` : ""}
      ${a.materials_allowed ? `Materials: ${esc(a.materials_allowed)}.` : ""}
      ${a.note ? `<div class="quiet" style="margin-top:4px">${esc(a.note)}</div>` : ""}
    </div>`;
  }

  // -- readings for this week
  const mine = D.readings.filter((r) => r.week_no === wk);
  const byCourse = {};
  mine.forEach((r) => (byCourse[r.course] ||= []).push(r));

  h += `<div class="cols">`;
  h += `<div class="panel"><h2>Readings this week <span class="muted">week ${wk}, ${fmt(weekMonday(wk))}</span></h2>`;
  if (!mine.length) {
    h += `<p class="muted">No chapter readings assigned for week ${wk}.</p>`;
  } else {
    for (const code of Object.keys(byCourse).sort()) {
      h += `<h3>${courseTag(code)}</h3>`;
      h += byCourse[code].map((r) => readingRow(r, prog[r.id])).join("");
    }
  }
  h += `</div>`;

  // -- next 14 days
  h += `<div class="panel"><h2>Due in the next 14 days</h2>`;
  const soon = dueSorted().filter((a) => {
    const n = daysBetween(today(), a.due_resolved);
    return n >= 0 && n <= 14;
  });
  h += soon.length ? soon.map(dueRow).join("") : `<p class="muted">Nothing due in the next fortnight.</p>`;

  // -- reverse planning
  const starting = dueSorted().filter((a) => {
    const s = startBy(a);
    return s && s <= today() && a.due_resolved > today() && Number(a.weight_pct || 0) >= 10;
  });
  if (starting.length) {
    h += `<h3 style="margin-top:16px">Start now</h3>
      <p class="quiet">Working back from the due date: an exam is not a thing you do on the day.</p>`;
    h += starting.map((a) => `<div class="due">
        <div class="when">${esc(a.weight_pct)}% · ${daysBetween(today(), a.due_resolved)}d left</div>
        <div class="body"><span class="course-pill">${esc(a.course)}</span> ${esc(a.name)}
        <div class="course-title">${esc(courseName(a.course))}</div>
        <div class="quiet">due ${a.date_precision === "exact" ? fmt(a.due_resolved) : "week of " + fmt(a.due_resolved)}</div></div>
      </div>`).join("");
  }
  h += `</div></div>`;

  // -- unfinished readings from earlier weeks
  const behind = D.readings.filter((r) => r.week_no < wk && (prog[r.id]?.status || "") !== "done");
  h += `<div class="panel"><h2>Not yet read from earlier weeks
    <span class="muted">${behind.length} chapter${behind.length === 1 ? "" : "s"}</span></h2>`;
  if (!behind.length) {
    h += `<p class="muted">Nothing outstanding. </p>`;
  } else {
    const bc = {};
    behind.forEach((r) => (bc[r.course] ||= []).push(r));
    h += `<div class="cols">`;
    for (const code of Object.keys(bc).sort()) {
      h += `<div><h3>${courseTag(code)}
        <span class="muted">${bc[code].length} behind</span></h3>`;
      h += bc[code].map((r) => readingRow(r, prog[r.id])).join("") + `</div>`;
    }
    h += `</div>`;
  }
  h += `</div>`;
  return h;
};

function readingRow(r, p) {
  const s = p?.status || "";
  const icon = s === "done" ? "✓" : s === "in_progress" ? "◐" : "";
  // r.pages is set only when the syllabus gives one range per chapter. When the
  // counts don't line up, the ranges belong to the class as a whole and it would
  // be a guess to pin one to this chapter -- so say so rather than implying it.
  const pages = r.pages ? ` <span class="muted">pp. ${esc(r.pages)}</span>`
    : r.all_pages ? ` <span class="muted" title="The syllabus lists these page ranges for the whole class, without saying which chapter each belongs to">(class pp. ${esc(r.all_pages)})</span>` : "";
  return `<div class="reading ${s === "done" ? "done" : ""}">
    <button class="statebtn" data-s="${esc(s)}" data-reading="${esc(r.id)}"
      title="not started → in progress → done">${icon}</button>
    <div class="body">
      <div class="what">Chapter ${esc(r.chapter)}${pages}</div>
      <div class="why">${esc(r.topic).slice(0, 150)}${r.topic.length > 150 ? "…" : ""}</div>
      <div class="why muted">for ${fmt(r.class_date)} · week ${r.week_no}</div>
    </div>
  </div>`;
}

function dueRow(a) {
  const n = daysBetween(today(), a.due_resolved);
  const cls = n < 0 ? "overdue" : n <= 4 ? "soon" : "";
  return `<div class="due ${cls}">
    <div class="when">${whenCell(a, false)}</div>
    <div class="body">
      <span class="course-pill">${esc(a.course)}</span>
      <span class="tag ${esc(a.type)}">${esc(a.type)}</span>
      ${esc(a.name)}
      <div class="course-title">${esc(courseName(a.course))}</div>
      ${a.scope_chapters ? `<div class="quiet">covers ch. ${esc(a.scope_chapters.replace(/;/g, ", "))}</div>` : ""}
    </div>
    <div class="left">${a.weight_pct ? a.weight_pct + "%" : "—"}<br>
      <span class="muted">${n < 0 ? Math.abs(n) + "d ago" : n + "d"}</span></div>
  </div>`;
}

/* ==================================================================== GRID */
VIEWS.grid = () => {
  const codes = D.courses.map((c) => c.code);
  const nowWk = termWeek(today());
  const last = LAST_WEEK();

  let h = `<div class="panel"><h2>Term grid <span class="muted">every week, every course</span></h2>
    <p class="quiet">Chapters and deadlines per week. Study week (${fmt(D.term.study_week[0])}–${fmt(D.term.study_week[1])}) and Thanksgiving are shaded. The current week is highlighted.</p>
    <div class="scroll"><table class="grid"><thead><tr><th>Week</th>`;
  h += codes.map((c) => `<th><span class="gridcode">${esc(c)}</span>
      <span class="gridtitle">${esc(courseName(c))}</span></th>`).join("") + `</tr></thead><tbody>`;

  for (let w = 1; w <= last; w++) {
    const mon = weekMonday(w);
    h += `<tr class="${w === nowWk ? "now" : ""}"><td class="wk">${w}<span class="mini muted">${fmtShort(mon)}</span></td>`;
    for (const code of codes) {
      const rows = D.schedule.filter((r) => r.course === code && r.week_no === w);
      if (!rows.length) { h += `<td class="muted"></td>`; continue; }
      if (rows.every((r) => r.due_type === "study_week")) { h += `<td class="break">study week</td>`; continue; }

      // Chapters come from the DERIVED readings, not the raw row, so an exam's
      // scope ("Chapters 1,2,3,6, and 7" in LGL225's Reading(s) column) is not
      // shown as reading newly assigned that week. The scope is stated on the
      // exam badge instead, where it belongs.
      const chapters = [...new Set(D.readings
        .filter((r) => r.course === code && r.week_no === w).map((r) => r.chapter))];
      const dues = D.assessments.filter((a) => a.course === code && a.week_no === w);
      let cell = "";
      if (chapters.length) cell += `<span class="ch">ch ${chapters.join(", ")}</span>`;
      for (const a of dues) {
        cell += `<span class="mini"><span class="tag ${esc(a.type)}">${esc(a.name)}${a.weight_pct ? " " + a.weight_pct + "%" : ""}</span>`;
        if (a.scope_chapters) cell += `<span class="ch muted"> covers ch ${esc(a.scope_chapters.replace(/;/g, ", "))}</span>`;
        cell += `</span>`;
      }
      if (!cell) cell = `<span class="muted">—</span>`;
      const holiday = Object.keys(D.term.holidays).find((d) => rows.some((r) => r.class_date === d));
      if (holiday) cell += `<span class="mini muted">⚠ ${esc(D.term.holidays[holiday])}</span>`;
      h += `<td>${cell}</td>`;
    }
    h += `</tr>`;
  }
  h += `</tbody></table></div></div>`;
  return h;
};

/* ================================================================== CRUNCH */
VIEWS.crunch = () => {
  const last = LAST_WEEK();
  const weeks = [];
  for (let w = 1; w <= last; w++) {
    const items = D.assessments.filter((a) => a.week_no === w);
    const load = items.reduce((s, a) => s + Number(a.weight_pct || 0), 0);
    const chapters = D.readings.filter((r) => r.week_no === w).length;
    weeks.push({ w, items, load, chapters, heavy: items.filter((a) => Number(a.weight_pct || 0) >= 20).length });
  }
  const max = Math.max(...weeks.map((x) => x.load), 1);
  const worst = weeks.slice().sort((a, b) => b.load - a.load).slice(0, 3).map((x) => x.w);

  let h = `<div class="panel"><h2>Crunch radar <span class="muted">weighted grade falling due each week, across all ${D.courses.length} courses</span></h2>
    <p class="quiet">Each professor sees only their own course. This is the one view nobody else can produce for you: a week where three courses independently schedule a midterm looks fine from every syllabus and impossible from your side of the desk.</p>`;

  const twoHeavy = weeks.filter((x) => x.heavy >= 2);
  if (twoHeavy.length) {
    h += `<div class="callout hot"><b>Weeks with two or more items worth 20% or more:</b><br>` +
      twoHeavy.map((x) => `Week ${x.w} (${fmtShort(weekMonday(x.w))}) — ${x.load}% total: ` +
        x.items.filter((a) => Number(a.weight_pct || 0) >= 20)
          .map((a) => `${a.course} ${courseName(a.course)} — ${a.name} ${a.weight_pct}%`)
          .join("; ")).join("<br>") + `</div>`;
  }

  h += `<div class="scroll"><table><thead><tr>
      <th>Week</th><th>Starting</th><th class="num">Grade due</th><th style="width:180px"></th>
      <th class="num">Chapters</th><th>Items</th></tr></thead><tbody>`;
  for (const x of weeks) {
    const isNow = x.w === termWeek(today());
    const barCls = x.load >= 50 ? "hot" : x.load >= 25 ? "" : "ok";
    h += `<tr ${isNow ? 'style="background:var(--warn-bg)"' : ""}>
      <td class="nowrap"><b>${x.w}</b>${worst.includes(x.w) && x.load ? ' <span class="tag hot">peak</span>' : ""}${isNow ? ' <span class="tag">now</span>' : ""}</td>
      <td class="nowrap">${fmtShort(weekMonday(x.w))}</td>
      <td class="num">${x.load ? x.load + "%" : "—"}</td>
      <td><div class="bar ${barCls}"><i style="width:${(x.load / max) * 100}%"></i></div></td>
      <td class="num">${x.chapters || "—"}</td>
      <td>${[...new Set(x.items.map((a) => a.course))].map((code) => `<div class="crunchgrp">
          <span class="course-pill">${esc(code)}</span>
          <span class="course-title">${esc(courseName(code))}</span><br>
          ${x.items.filter((a) => a.course === code).map((a) =>
            `<span class="tag ${esc(a.type)}">${esc(a.name)}${a.weight_pct ? " " + a.weight_pct + "%" : ""}</span>`).join(" ")}
        </div>`).join("") || '<span class="muted">—</span>'}</td>
    </tr>`;
  }
  h += `</tbody></table></div></div>`;
  return h;
};

/* =================================================================== EXAMS */
VIEWS.exams = () => {
  const items = dueSorted().filter((a) => ["exam", "test", "quiz"].includes(a.type));
  const unstated = items.filter((a) => a.scope_source !== "stated");

  let h = `<div class="panel"><h2>Exams, tests and quizzes <span class="muted">what each one actually covers</span></h2>
    <p class="quiet">Scope is shown only where the syllabus states it. Where it does not, this says so instead of guessing — the difference matters, because the courses that <em>do</em> state scope are not consistent with each other.</p>`;

  const stated = items.filter((a) => a.scope_source === "stated");
  h += `<div class="callout"><b>On whether your exams are cumulative.</b>
    ${stated.length} of ${items.length} assessments name their chapters.
    <b>LGL153</b> splits cleanly with no overlap (1–4, then 5–7, then 8–10).
    <b>LGL152</b> Test #2 re-covers chapters 11–12 from Test #1.
    <b>LGL225</b>'s final re-covers chapters 3 and 6 from its midterm and skips 1, 2, 7 and 9 entirely.
    So: mostly forward-looking, but read the stated list literally rather than assuming “everything since the last exam”.
    The remaining ${unstated.length} state nothing — worth one email each.</div>`;

  h += items.map((a) => {
    const inScope = a.scope_chapters
      ? D.schedule.filter((r) => r.course === a.course &&
          r.chapters.split(";").filter(Boolean).some((c) => a.scope_chapters.split(";").includes(c)))
      : [];
    return `<div class="panel" style="background:var(--panel2)">
      <div class="spread">
        <h3><span class="course-pill">${esc(a.course)}</span>
          <span class="tag ${esc(a.type)}">${esc(a.type)}</span> ${esc(a.name)}
          <div class="course-title">${esc(courseName(a.course))}</div></h3>
        <div class="nowrap"><b>${a.weight_pct ? a.weight_pct + "%" : "no weight"}</b>
          · ${whenCell(a, true)}</div>
      </div>
      <table><tbody>
        <tr><th style="width:130px">Scope</th><td>${a.scope_chapters
          ? `<b>Chapters ${esc(a.scope_chapters.replace(/;/g, ", "))}</b> <span class="tag ok">stated in syllabus</span>`
          : `<span class="tag hot">NOT STATED — ask your professor</span>`}</td></tr>
        ${a.materials_allowed ? `<tr><th>Materials</th><td>${esc(a.materials_allowed)}</td></tr>` : ""}
        ${a.format ? `<tr><th>Format</th><td>${esc(a.format)}</td></tr>` : ""}
        ${a.duration ? `<tr><th>Duration</th><td>${esc(a.duration)}</td></tr>` : ""}
        ${inScope.length ? `<tr><th>Weeks to review</th><td>${inScope.map((r) =>
          `<div>${fmtShort(r.class_date)} — ch ${esc(r.chapters.replace(/;/g, ", "))} — ${esc(r.topic).slice(0, 90)}…</div>`).join("")}</td></tr>` : ""}
        ${a.note ? `<tr><th>Note</th><td>${esc(a.note)}</td></tr>` : ""}
        <tr><th>Syllabus says</th><td class="raw">${esc(a.due_date_raw)}</td></tr>
      </tbody></table>
    </div>`;
  }).join("");
  h += `</div>`;
  return h;
};

/* ================================================================= COURSES */
VIEWS.courses = () => {
  const code = state.course || D.courses[0].code;
  state.course = code;
  const c = D.courses.find((x) => x.code === code);
  const prog = progressMap();
  const gm = gradeMap();
  const items = D.assessments.filter((a) => a.course === code);

  const graded = items.filter((a) => gm[a.id]?.earned_pct !== undefined && gm[a.id]?.earned_pct !== "");
  const gradedWeight = graded.reduce((s, a) => s + Number(a.weight_pct || 0), 0);
  const banked = graded.reduce((s, a) => s + Number(a.weight_pct || 0) * Number(gm[a.id].earned_pct) / 100, 0);
  const remaining = 100 - gradedWeight;
  const standing = gradedWeight ? banked / gradedWeight * 100 : null;
  const needed = remaining > 0 ? (state.target - banked) / remaining * 100 : null;

  let h = `<div class="panel"><div class="row">
    <label for="csel" style="margin:0">Course</label>
    <select id="csel">${D.courses.map((x) =>
      `<option value="${esc(x.code)}" ${x.code === code ? "selected" : ""}>${esc(x.code)} — ${esc(x.name)}</option>`).join("")}</select>
  </div></div>`;

  h += `<div class="cols">
    <div class="panel"><h2>${esc(c.code)} <span class="muted">${esc(c.name)}</span></h2>
      <table><tbody>
        ${c.instructor ? `<tr><th style="width:110px">Instructor</th><td>${esc(c.instructor)}${c.email ? ` · <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}</td></tr>`
          : `<tr><th>Instructor</th><td><span class="tag warn">not named in syllabus</span></td></tr>`}
        ${c.mode ? `<tr><th>Mode</th><td>${esc(c.mode)}</td></tr>` : ""}
        <tr><th>Meets</th><td>${esc(c.meeting_days) || "—"}</td></tr>
        <tr><th>Textbook</th><td>${c.textbook
          ? `${esc(c.textbook)}<div class="quiet">${esc(c.textbook_author)}${c.textbook_isbn ? " · ISBN " + esc(c.textbook_isbn) : ""}</div>`
          : `<span class="tag warn">not named in syllabus</span>`}</td></tr>
        ${c.class_nbr ? `<tr><th>Class nbr</th><td>${esc(c.class_nbr)}${c.section ? " · section " + esc(c.section) : ""}</td></tr>` : ""}
      </tbody></table>
      ${c.note ? `<div class="callout" style="margin-top:10px">${esc(c.note)}</div>` : ""}
    </div>

    <div class="panel"><h2>Standing</h2>
      <div class="row"><label for="tgt" style="margin:0">Target</label>
        <input id="tgt" class="mark" type="number" min="0" max="100" value="${state.target}"> %</div>
      <table style="margin-top:10px"><tbody>
        <tr><th>Graded so far</th><td>${gradedWeight}% of the course</td></tr>
        <tr><th>Average on it</th><td>${standing === null ? '<span class="muted">nothing marked yet</span>' : `<b>${standing.toFixed(1)}%</b>`}</td></tr>
        <tr><th>Banked</th><td>${banked.toFixed(1)} of 100 points</td></tr>
        <tr><th>Still to come</th><td>${remaining}%</td></tr>
        <tr><th>Need on the rest</th><td>${needed === null ? "—"
          : needed <= 0 ? `<span class="tag ok">target already secured</span>`
          : needed > 100 ? `<span class="tag hot">${state.target}% is no longer reachable</span>`
          : `<b class="${needed > 85 ? "" : ""}">${needed.toFixed(1)}%</b> average ${needed > 85 ? '<span class="tag hot">steep</span>' : ""}`}</td></tr>
      </tbody></table>
      <p class="quiet" style="margin-top:9px">Enter marks in the table below as they come back.
      Seneca's drop-without-academic-penalty deadline is <b>${fmt(D.term.drop_deadline)}</b>, which is when this number matters most.</p>
    </div>
  </div>`;

  h += `<div class="panel"><h2>Assessments</h2><div class="scroll"><table>
    <thead><tr><th>When</th><th>Item</th><th class="num">Weight</th><th>Scope</th><th class="num">Mark</th><th>Returned</th></tr></thead><tbody>`;
  for (const a of items.slice().sort((x, y) => (x.due_resolved || "").localeCompare(y.due_resolved || ""))) {
    const g = gm[a.id] || {};
    h += `<tr>
      <td class="nowrap">${a.date_precision === "exact" ? fmt(a.due_resolved) : "wk of " + fmtShort(a.due_resolved)}</td>
      <td><span class="tag ${esc(a.type)}">${esc(a.type)}</span> ${esc(a.name)}
        ${a.note ? `<div class="quiet">${esc(a.note)}</div>` : ""}</td>
      <td class="num">${a.weight_pct ? a.weight_pct + "%" : "—"}</td>
      <td>${a.scope_chapters ? "ch " + esc(a.scope_chapters.replace(/;/g, ", "))
        : `<span class="tag hot">ask</span>`}</td>
      <td class="num"><input class="mark" type="number" min="0" max="100" step="0.1"
        data-grade="${esc(a.id)}" value="${esc(g.earned_pct || "")}" placeholder="—"></td>
      <td class="nowrap quiet">${esc(g.returned_date || "")}</td>
    </tr>`;
  }
  h += `</tbody></table></div></div>`;

  h += `<div class="panel"><h2>Schedule and readings</h2><div class="scroll"><table>
    <thead><tr><th style="width:96px">Date</th><th class="num">Wk</th><th>Topic</th><th style="width:250px">Readings</th><th>Due</th></tr></thead><tbody>`;
  for (const r of D.schedule.filter((x) => x.course === code)) {
    const isBreak = r.due_type === "study_week";
    const reads = D.readings.filter((x) => x.schedule_id === r.id);
    h += `<tr ${r.week_no === termWeek(today()) ? 'style="background:var(--warn-bg)"' : ""}>
      <td class="nowrap">${fmtShort(r.class_date)}<div class="quiet">${DOW[toDate(r.class_date).getDay()]}</div></td>
      <td class="num">${r.week_no}</td>
      <td>${isBreak ? '<i class="muted">study week</i>' : esc(r.topic)}
        ${r.note ? `<div class="quiet">⚠ ${esc(r.note)}</div>` : ""}</td>
      <td>${reads.map((x) => {
        const s = prog[x.id]?.status || "";
        return `<div class="row" style="gap:6px;flex-wrap:nowrap">
          <button class="statebtn" data-s="${esc(s)}" data-reading="${esc(x.id)}">${s === "done" ? "✓" : s === "in_progress" ? "◐" : ""}</button>
          <span class="${s === "done" ? "muted" : ""}">ch ${esc(x.chapter)}${x.pages ? " pp." + esc(x.pages) : ""}</span></div>`;
      }).join("") || (r.reading_raw ? `<span class="quiet">${esc(r.reading_raw).slice(0, 90)}</span>` : '<span class="muted">—</span>')}</td>
      <td>${r.due_item ? `<span class="tag ${esc(r.due_type)}">${esc(r.due_item)}</span>` : ""}</td>
    </tr>`;
  }
  h += `</tbody></table></div>
    <p class="quiet">Verbatim syllabus text is kept in <code>reading_raw</code> / <code>date_raw</code> in
    <code>data/schedule.csv</code>, so any figure here traces back to a page of the original PDF.</p></div>`;
  return h;
};

/* =================================================================== NOTES */
VIEWS.notes = () => {
  const byCourse = {};
  D.notes.forEach((n) => (byCourse[n.course || "—"] ||= []).push(n));

  let h = `<div class="panel"><h2>Reading notes <span class="muted">${D.notes.length} note${D.notes.length === 1 ? "" : "s"}</span></h2>
    <p class="quiet">Plain Markdown under <code>notes/&lt;COURSE&gt;/</code>. Write them here or in any editor — this only indexes and renders them, so your notes are never trapped in this app.</p>
    <div class="row">
      <select id="newnote-course">${D.courses.map((c) =>
        `<option value="${esc(c.code)}">${esc(c.code)} — ${esc(c.name)}</option>`).join("")}</select>
      <select id="newnote-row"><option value="">— blank note —</option>${D.schedule
        .filter((r) => r.due_type !== "study_week")
        .map((r) => `<option value="${esc(r.id)}">${esc(r.course)} · ${fmtShort(r.class_date)} · ${esc(r.topic).slice(0, 60)}</option>`).join("")}</select>
      <button id="newnote">+ New note</button>
    </div></div>`;

  h += `<div class="notelayout">
    <div class="panel notelist">`;
  if (!D.notes.length) h += `<p class="muted">No notes yet.</p>`;
  for (const code of Object.keys(byCourse).sort()) {
    h += `<div class="grp">${esc(code)}<span class="grptitle">${esc(courseName(code))}</span></div>`;
    h += byCourse[code].sort((a, b) => (b.week_of || "").localeCompare(a.week_of || ""))
      .map((n) => `<a href="#" data-note="${esc(n.path)}" class="${n.path === state.notePath ? "on" : ""}">
        ${esc(n.title)}<div class="quiet">${n.week_of ? fmtShort(n.week_of) + " · " : ""}${n.words} words</div></a>`).join("");
  }
  h += `</div><div class="panel" id="notepane">`;
  h += state.notePath
    ? `<p class="muted">loading ${esc(state.notePath)}…</p>`
    : `<p class="muted">Pick a note, or create one. The template opens with Rule / Elements / Exceptions / Cases / Questions for the professor — the shape you will want in November.</p>`;
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
      <textarea id="noteedit">${esc(j.text)}</textarea>`;
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
  const caseCourses = ["LGL151", "LGL152", "LGL250", "LGL156", "LGL160", "LGL153", "LGL154", "LGL225"];
  let h = `<div class="panel"><h2>Case briefs <span class="muted">${D.cases.length} case${D.cases.length === 1 ? "" : "s"}</span></h2>
    <p class="quiet">LGL151, LGL152 and LGL250 all assign heavy case reading. Cite to the
    <b>McGill Guide</b> (Canadian Guide to Uniform Legal Citation), not Bluebook — the habit is
    cheaper to build now than to unlearn. <code>verified</code> means you have opened the decision
    yourself on CanLII: nothing goes into graded work until that column says yes.</p>
    <div class="row">
      <input id="c-style" placeholder="Style of cause — e.g. Jones v Tsige" style="min-width:230px">
      <input id="c-cite" placeholder="Citation — 2012 ONCA 32" style="min-width:150px">
      <input id="c-url" placeholder="CanLII URL" style="min-width:170px">
      <select id="c-course">${caseCourses.map((c) => `<option>${c}</option>`).join("")}</select>
      <button id="c-add">+ Add</button>
    </div></div>`;

  h += `<div class="panel"><div class="scroll"><table>
    <thead><tr><th>Style of cause</th><th>Citation</th><th>Course</th><th>Status</th><th>Verified</th><th></th></tr></thead><tbody>`;
  if (!D.cases.length) h += `<tr><td colspan="6" class="muted">No cases yet.</td></tr>`;
  for (const c of D.cases) {
    h += `<tr>
      <td>${c.canlii_url ? `<a href="${esc(c.canlii_url)}" target="_blank" rel="noreferrer">${esc(c.style_of_cause)}</a>` : esc(c.style_of_cause)}</td>
      <td class="raw">${esc(c.citation)}</td>
      <td><span class="course-pill">${esc(c.course)}</span>
        <div class="course-title">${esc(courseName(c.course))}</div></td>
      <td><select data-case-status="${esc(c.id)}">${["stub", "drafted", "reviewed", "exam-ready"]
        .map((s) => `<option ${c.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
      <td><input type="checkbox" data-case-verified="${esc(c.id)}" ${c.verified === "yes" ? "checked" : ""}></td>
      <td><button class="ghost" data-case-del="${esc(c.id)}">×</button></td>
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
        what: `${a.weight_pct}% of the course, and the syllabus does not say which chapters it covers. One email settles it.`,
        raw: a.due_date_raw });
    }
    if (a.confidence && a.confidence !== "high") {
      out.push({ kind: "Low confidence", who: `${a.course} ${a.name}`, sub: courseName(a.course), what: a.note, raw: a.due_date_raw });
    } else if (a.note && FLAG.test(a.note)) {
      out.push({ kind: "Worth confirming", who: `${a.course} ${a.name}`, sub: courseName(a.course), what: a.note, raw: a.due_date_raw });
    }
  }
  for (const r of D.schedule) {
    if ((r.confidence && r.confidence !== "high") || (r.note && FLAG.test(r.note))) {
      out.push({ kind: "Schedule row", who: `${r.course} ${fmtShort(r.class_date)}`, sub: courseName(r.course), what: r.note, raw: r.date_raw });
    }
  }
  for (const c of D.courses) {
    if (c.note && FLAG.test(c.note)) out.push({ kind: "Course detail", who: c.code, sub: c.name, what: c.note, raw: "" });
    if (!c.textbook) out.push({ kind: "Textbook unknown", who: c.code, sub: c.name,
      what: "The syllabus cites chapter numbers but never names the book. Check Blackboard or the Seneca bookstore before you buy anything.", raw: "" });
    if (!c.instructor) out.push({ kind: "Instructor unknown", who: c.code, sub: c.name,
      what: "No instructor named in the syllabus.", raw: "" });
  }
  return out;
}

VIEWS.review = () => {
  const items = reviewItems();
  const groups = {};
  items.forEach((i) => (groups[i.kind] ||= []).push(i));

  let h = `<div class="panel"><h2>Needs review <span class="muted">${items.length} open question${items.length === 1 ? "" : "s"}</span></h2>
    <p class="quiet">Everything the syllabi left ambiguous, kept visible instead of quietly resolved.
    Budget one sitting to clear it, then record what you learn in <code>data/changes.md</code> with the
    authority you heard it from. A missing row looks exactly like a free week, which is the most
    dangerous failure mode in a tracker for eight courses.</p></div>`;

  for (const kind of Object.keys(groups)) {
    h += `<div class="panel"><h2>${esc(kind)} <span class="muted">${groups[kind].length}</span></h2>`;
    h += groups[kind].map((i) => `<div class="due"><div class="when"><b>${esc(i.who)}</b>
      ${i.sub ? `<div class="course-title">${esc(i.sub)}</div>` : ""}</div>
      <div class="body">${esc(i.what || "")}
      ${i.raw ? `<div class="raw">syllabus: ${esc(i.raw)}</div>` : ""}</div></div>`).join("");
    h += `</div>`;
  }
  return h;
};

/* ============================================================ interactions */
document.addEventListener("click", async (e) => {
  const rb = e.target.closest("[data-reading]");
  if (rb) {
    const order = ["", "in_progress", "done"];
    const next = order[(order.indexOf(rb.dataset.s) + 1) % order.length];
    const j = await post("/api/progress", { reading_id: rb.dataset.reading, status: next || "not_started" });
    D.progress = j.progress;
    render();
    return;
  }
  const na = e.target.closest("[data-note]");
  if (na) { e.preventDefault(); openNote(na.dataset.note); return; }

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
  if (e.target.id === "csel") { state.course = e.target.value; render(); return; }
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

load().catch((e) => {
  main.innerHTML = `<div class="panel"><h2>Could not load data</h2>
    <p>${esc(e.message)}</p><p class="quiet">Is <code>python serve.py</code> still running?</p></div>`;
});
