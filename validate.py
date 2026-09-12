"""Check data/*.csv for the extraction errors that actually happen.

Run this after any edit to data/, and after re-running extract.py. It never
changes anything -- it prints and sets an exit code.

The design rule throughout: a value that does not add up is EVIDENCE, not a
thing to quietly correct. Auto-normalising assessment weights to 100% would
turn a misread 30 into a plausible-looking wrong number and destroy the
cheapest integrity check available here.

    python validate.py
"""

import collections
import csv
import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
BUILD = ROOT / "build"

TERM_START = dt.date(2026, 9, 8)
TERM_END = dt.date(2026, 12, 16)
THANKSGIVING = dt.date(2026, 10, 12)
STUDY_WEEK = (dt.date(2026, 10, 26), dt.date(2026, 10, 30))
WEEK1_MONDAY = dt.date(2026, 9, 7)
SENECA_SINGLE_ITEM_CAP = 40.0   # Student Assessment Policy, absent written chair permission

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

errors, warns, infos = [], [], []


def err(msg):
    errors.append(msg)


def warn(msg):
    warns.append(msg)


def info(msg):
    infos.append(msg)


def load(name):
    path = DATA / name
    if not path.exists():
        err(f"{name} is missing")
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def as_date(s):
    try:
        return dt.date.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def week_no(d):
    return ((d - WEEK1_MONDAY).days // 7) + 1


def norm(s):
    return re.sub(r"\s+", " ", (s or "")).strip()


def page_range_in(rng, dump):
    """Is this page range present in the source dump?

    A range can be broken across a line at the hyphen -- LGL151 really does
    render "(pages 109-" on one line and "117)" two lines later -- and because
    pdftotext lays the table out in columns, the topic column's text lands
    between the two halves. So the contiguous form is checked first, then the
    split form: the range must still START where we say it does, and the end
    page must appear.
    """
    start, end = rng.split("-")
    if re.search(rf"\b{start}\s*-\s*{end}\b", dump):
        return True
    return bool(re.search(rf"\b{start}\s*-", dump) and re.search(rf"\b{end}\b", dump))


# --------------------------------------------------------------------------
courses = load("courses.csv")
schedule = load("schedule.csv")
assessments = load("assessments.csv")
if not (courses and schedule and assessments):
    print("FATAL: core data files missing; run the seeders / extract.py first")
    raise SystemExit(2)

codes = [c["code"] for c in courses]


# -- 1. assessment weights must reconcile to exactly 100% per course ---------
by_course = collections.defaultdict(list)
for a in assessments:
    by_course[a["course"]].append(a)

for code in codes:
    items = by_course.get(code, [])
    if not items:
        err(f"{code}: no assessments at all")
        continue
    total = sum(float(a["weight_pct"]) for a in items if a["weight_pct"])
    if abs(total - 100) > 0.5:
        err(f"{code}: assessment weights sum to {total:g}%, not 100% -- a component is "
            f"missing or misread. Components: " +
            ", ".join(f"{a['name']} {a['weight_pct'] or '-'}%" for a in items))


# -- 2. Seneca caps any single assessment at 40% -----------------------------
for a in assessments:
    if a["weight_pct"] and float(a["weight_pct"]) > SENECA_SINGLE_ITEM_CAP:
        err(f"{a['course']} {a['name']}: {a['weight_pct']}% exceeds Seneca's {SENECA_SINGLE_ITEM_CAP:g}% "
            f"single-assessment cap -- almost certainly a parse error. Source: {a['due_date_raw']}")


# -- 3. every date must fall inside the term --------------------------------
for r in schedule:
    d = as_date(r["class_date"])
    if d is None:
        err(f"{r['id']}: class_date '{r['class_date']}' is not a valid ISO date")
    elif not (TERM_START <= d <= TERM_END):
        err(f"{r['id']}: {d} is outside the term ({TERM_START} to {TERM_END})")

for a in assessments:
    for field in ("due_date", "due_week_of"):
        if a[field]:
            d = as_date(a[field])
            if d is None:
                err(f"{a['id']}: {field} '{a[field]}' is not a valid ISO date")
            elif not (TERM_START - dt.timedelta(days=1) <= d <= TERM_END):
                err(f"{a['id']}: {field} {d} is outside the term")


# -- 4. every class date on that course's own modal weekday -----------------
# Derived from the data, NOT assumed to be Monday: LGL153's dates are exact
# Fridays and LGL151's are Mondays, so a "week_of must be a Monday" rule --
# which generic syllabus parsers use -- would reject every valid row here.
modal = {}
for code in codes:
    days = [as_date(r["class_date"]).weekday()
            for r in schedule if r["course"] == code and as_date(r["class_date"])]
    if not days:
        continue
    modal[code] = collections.Counter(days).most_common(1)[0][0]
    for r in schedule:
        if r["course"] != code:
            continue
        d = as_date(r["class_date"])
        if d and d.weekday() != modal[code]:
            # Two legitimate exceptions: the duplicated study-week rows (one per
            # weekly meeting), and week 1, because Labour Day is Mon Sept 7 so
            # the term opens on Tuesday the 8th.
            expected = r["due_type"] == "study_week" or d == TERM_START
            (info if expected else warn)(
                f"{r['id']}: {d} is a {DAYS[d.weekday()]} but {code} normally meets "
                f"{DAYS[modal[code]]} (raw: '{r['date_raw']}')"
                + ("  [term opens Tue Sept 8; Labour Day is the 7th]" if d == TERM_START else ""))


# -- 5. consecutive meetings 7 days apart, except around the breaks ---------
for code in codes:
    rows = sorted((r for r in schedule if r["course"] == code),
                  key=lambda r: r["class_date"])
    for prev, cur in zip(rows, rows[1:]):
        a, b = as_date(prev["class_date"]), as_date(cur["class_date"])
        if not (a and b):
            continue
        gap = (b - a).days
        if gap == 7:
            continue
        spans_break = (a <= THANKSGIVING <= b) or (a <= STUDY_WEEK[1] and b >= STUDY_WEEK[0])
        opens_term = a == TERM_START      # Tue start, so week 1 -> week 2 is 6 days
        msg = (f"{code}: {a} -> {b} is a {gap}-day gap, not 7 "
               f"('{prev['date_raw']}' -> '{cur['date_raw']}')")
        if spans_break or opens_term or gap in (1, 2):
            info(msg + "  [break / second weekly meeting]")
        else:
            warn(msg)


# -- 6. deadlines need dates; every course needs a dated final --------------
for a in assessments:
    if not (a["due_date"] or a["due_week_of"]):
        err(f"{a['id']} ({a['name']}): no date of any kind")

for code in codes:
    finals = [a for a in by_course[code]
              if a["type"] in ("exam", "test") and "final" in a["name"].lower()]
    if not finals:
        err(f"{code}: no final exam/test found")
    elif not any(f["due_date"] or f["due_week_of"] for f in finals):
        err(f"{code}: final exam has no date")


# -- 7. week_no must be derived from the date, never trusted from the page ---
# LGL153's syllabus prints "13" twice.
for r in schedule:
    d = as_date(r["class_date"])
    if d and r["week_no"] and int(r["week_no"]) != week_no(d):
        err(f"{r['id']}: week_no {r['week_no']} disagrees with {d} "
            f"(term week {week_no(d)}) -- week numbers must be derived from dates")


# -- 8. provenance: each value must occur in the MATCHING source row ---------
# This is the rule that matters most, and the one an earlier version got wrong.
# Checking that "QUIZ #1 (15%)" appears *somewhere* in LGL151 passes happily while
# the quiz is filed a week early. build/<CODE>.rows.json reads each table by its
# real cell boundaries, so the check can be: does this value appear in the row
# with THIS date?
prov_checked = prov_failed = 0


def gt_rows(code):
    path = BUILD / f"{code}.rows.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))["rows"]


def row_text(gr):
    return norm(gr["date"] + " " + " ".join(str(v) for v in gr["cells"].values()))


def date_key(s):
    """Compare dates loosely: 'Wed 9/9' vs '9/9', 'Beginning Sept. 8' vs 'Sept. 8'."""
    s = re.sub(r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+", "", norm(s), flags=re.I)
    s = re.sub(r"^Beginning\s+", "", s, flags=re.I)
    return s.replace(".", "").lower().strip()


truth = {c: gt_rows(c) for c in codes}
for code, rows_gt in truth.items():
    if rows_gt is None:
        warn(f"{code}: build/{code}.rows.json missing -- provenance cannot be checked. "
             f"Run extract.py.")

for r in schedule:
    rows_gt = truth.get(r["source_file"])
    if rows_gt is None:
        continue
    prov_checked += 1
    want = date_key(r["date_raw"])
    match = next((g for g in rows_gt if date_key(g["date"]) == want), None)
    if match is None:
        prov_failed += 1
        err(f"{r['id']}: no row dated '{r['date_raw']}' exists in "
            f"build/{r['source_file']}.rows.json")
        continue
    text = row_text(match)

    for ch in filter(None, r["chapters"].split(";")):
        if not re.search(rf"\b{ch}\b", text):
            prov_failed += 1
            err(f"{r['id']}: chapter {ch} is not in the '{r['date_raw']}' row of the syllabus")
    for rng in filter(None, r["pages"].split(";")):
        if not page_range_in(rng, text):
            prov_failed += 1
            err(f"{r['id']}: page range '{rng}' is not in the '{r['date_raw']}' row")
    if r["weight_pct"] and f"{r['weight_pct']}%" not in text:
        # A weight is sometimes stated on the row where the work is HANDED OUT
        # rather than the row where it is due -- LGL225 announces "Assignment -
        # 20%" on 11/11 and the 11/18 row just says "Assignment due". That is
        # the syllabus being terse, not the data being wrong, so only complain
        # if the figure appears nowhere nearby.
        near = [g for g in rows_gt
                if abs(g["row"] - match["row"]) <= 1 and f"{r['weight_pct']}%" in row_text(g)]
        if near:
            info(f"{r['id']}: {r['weight_pct']}% is stated on the {near[0]['date']} row "
                 f"(where it is handed out), not on '{r['date_raw']}' (where it is due)")
        else:
            prov_failed += 1
            err(f"{r['id']}: a {r['weight_pct']}% item is recorded on '{r['date_raw']}', but no "
                f"{r['weight_pct']}% appears in that row of the syllabus or either "
                f"neighbour -- is it filed on the wrong week?")
    if r["due_item"]:
        # first distinctive word of the due item, e.g. QUIZ / MIDTERM / Assignment
        head = next((w for w in re.findall(r"[A-Za-z#]+", r["due_item"]) if len(w) > 3), "")
        if head and head.lower() not in text.lower():
            prov_failed += 1
            err(f"{r['id']}: due item '{r['due_item']}' is recorded on '{r['date_raw']}', but "
                f"'{head}' does not appear in that row of the syllabus")

# assessments must land on a row that actually carries their weight
for a in assessments:
    rows_gt = truth.get(a["source_file"])
    if rows_gt is None or not a["weight_pct"]:
        continue
    target = a["due_date"] or a["due_week_of"]
    rowmatch = next((r for r in schedule
                     if r["course"] == a["course"] and r["class_date"] == target), None)
    if rowmatch is None:
        warn(f"{a['id']}: {target} is not a class date for {a['course']}")
        continue
    match = next((g for g in rows_gt if date_key(g["date"]) == date_key(rowmatch["date_raw"])), None)
    if match and f"{a['weight_pct']}%" not in row_text(match):
        near = [g for g in rows_gt
                if abs(g["row"] - match["row"]) <= 1 and f"{a['weight_pct']}%" in row_text(g)]
        if not near:
            err(f"{a['id']} ({a['name']}): {a['weight_pct']}% is recorded on {target}, but "
                f"{a['weight_pct']}% appears in neither that row of the syllabus nor either "
                f"neighbour")


# -- 9. schedule and assessments must agree -------------------------------
sched_weighted = [(r["course"], float(r["weight_pct"])) for r in schedule if r["weight_pct"]]
asmt_weighted = [(a["course"], float(a["weight_pct"])) for a in assessments if a["weight_pct"]]
for code in codes:
    s = sorted(w for c, w in sched_weighted if c == code)
    m = sorted(w for c, w in asmt_weighted if c == code)
    if s != m:
        warn(f"{code}: weighted items in schedule.csv {s} do not match assessments.csv {m}")


# -- 10. exam scope: report, never infer -----------------------------------
unstated = [a for a in assessments
            if a["type"] in ("exam", "test") and a["scope_source"] != "stated"]
stated = [a for a in assessments if a["scope_source"] == "stated"]
info(f"exam/test scope stated in the syllabus for {len(stated)} items; "
     f"{len(unstated)} exams/tests do NOT state their scope and must be confirmed with the professor")


# --------------------------------------------------------------------------
def section(title, items, bullet):
    if not items:
        return
    print(f"\n{title}")
    for m in items:
        print(f"  {bullet} {m}")


print(f"Paralegal Beagle -- data check")
print(f"  {len(courses)} courses, {len(schedule)} class meetings, {len(assessments)} assessments")
print(f"  provenance: {prov_checked - prov_failed}/{prov_checked} schedule rows matched to their own row in build/*.rows.json")

section("ERRORS (fix before trusting the data)", errors, "x")
section("WARNINGS (check these)", warns, "!")
section("NOTES", infos, "-")

print()
if errors:
    print(f"FAIL: {len(errors)} error(s), {len(warns)} warning(s)")
    sys.exit(1)
print(f"PASS: 0 errors, {len(warns)} warning(s), {len(infos)} note(s)")
