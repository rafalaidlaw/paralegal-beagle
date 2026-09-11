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
dumps = {}
for code in codes:
    p = BUILD / f"{code}.txt"
    dumps[code] = norm(p.read_text(encoding="utf-8", errors="replace")) if p.exists() else None
    if dumps[code] is None:
        warn(f"{code}: build/{code}.txt missing -- provenance cannot be checked. Run extract.py.")


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


# -- 8. provenance: the load-bearing values must occur in the source dump ----
# This does not try to match whole cells: pdftotext interleaves wrapped columns,
# so a multi-line "Reading(s)" cell is not contiguous in the dump. It checks the
# values a wrong row would get wrong -- the date string, each chapter number,
# each page range, each percentage.
prov_checked = prov_failed = 0
for r in schedule:
    dump = dumps.get(r["source_file"])
    if not dump:
        continue
    prov_checked += 1
    if r["date_raw"] and norm(r["date_raw"]) not in dump:
        prov_failed += 1
        err(f"{r['id']}: date_raw '{r['date_raw']}' does not appear in build/{r['source_file']}.txt")
    for rng in filter(None, r["pages"].split(";")):
        if not page_range_in(rng, dump):
            prov_failed += 1
            err(f"{r['id']}: page range '{rng}' does not appear in build/{r['source_file']}.txt")
    if r["weight_pct"] and f"{r['weight_pct']}%" not in dump:
        prov_failed += 1
        err(f"{r['id']}: weight '{r['weight_pct']}%' does not appear in build/{r['source_file']}.txt")

for a in assessments:
    dump = dumps.get(a["source_file"])
    if not dump or not a["weight_pct"]:
        continue
    if f"{a['weight_pct']}%" not in dump and f"{a['weight_pct']} %" not in dump:
        err(f"{a['id']}: weight '{a['weight_pct']}%' does not appear in build/{a['source_file']}.txt")


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
print(f"  provenance: {prov_checked - prov_failed}/{prov_checked} schedule rows proved against build/")

section("ERRORS (fix before trusting the data)", errors, "x")
section("WARNINGS (check these)", warns, "!")
section("NOTES", infos, "-")

print()
if errors:
    print(f"FAIL: {len(errors)} error(s), {len(warns)} warning(s)")
    sys.exit(1)
print(f"PASS: 0 errors, {len(warns)} warning(s), {len(infos)} note(s)")
