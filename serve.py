"""The local web app. Python standard library only -- no pip install, no build.

    python serve.py          # then open http://127.0.0.1:8787
    python serve.py --port 9000 --no-browser

Binds to 127.0.0.1 only, so nothing outside this machine can reach it.

Reads data/*.csv, serves them as JSON, and writes back the three files you own:
progress.csv, grades.csv and cases.csv, plus Markdown under notes/. Everything
else -- readings, term weeks, grade standing, crunch load -- is DERIVED on each
request and never stored, so re-running extract.py can't contradict it.
"""

import argparse
import csv
import datetime as dt
import http.server
import json
import os
import re
import socketserver
import threading
import urllib.parse
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
APP = ROOT / "app"
NOTES = ROOT / "notes"
SYLLABI = ROOT / "syllabi"

TERM = {
    "start": "2026-09-08",
    "end": "2026-12-16",
    "week1_monday": "2026-09-07",
    "study_week": ["2026-10-26", "2026-10-30"],
    "holidays": {"2026-09-07": "Labour Day (Seneca closed)",
                 "2026-10-12": "Thanksgiving (Seneca closed)"},
    "drop_deadline": "2026-11-13",
    "drop_deadline_label": "Last day to drop Session 1 without academic penalty",
    "grades_released": "2026-12-22",
}

WEEK1_MONDAY = dt.date.fromisoformat(TERM["week1_monday"])

# How far ahead to start warning, by assessment type. Reverse-planning: an exam
# is not a thing you do on the day, it is a thing you start two weeks before.
LEAD_DAYS = {"exam": 14, "test": 14, "assignment": 10, "presentation": 10,
             "quiz": 5, "milestone": 5, "": 7}

_lock = threading.Lock()


# ---------------------------------------------------------------- csv helpers
def read_csv(name):
    path = DATA / name
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(name, fieldnames, rows):
    path = DATA / name
    tmp = path.with_suffix(".csv.tmp")
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})
    os.replace(tmp, path)      # atomic, so a crash mid-write can't truncate the file


def upsert(name, fieldnames, key, record):
    """Insert or replace one row, keyed on `key`. Blank-valued rows are deleted."""
    with _lock:
        rows = read_csv(name)
        rows = [r for r in rows if r.get(key) != record.get(key)]
        meaningful = any(v not in ("", None) for k, v in record.items() if k != key)
        if meaningful:
            rows.append(record)
        rows.sort(key=lambda r: r.get(key, ""))
        write_csv(name, fieldnames, rows)
        return rows


# ------------------------------------------------------------------- deriving
def week_no(iso):
    return ((dt.date.fromisoformat(iso) - WEEK1_MONDAY).days // 7) + 1



def derive_readings(schedule, assessments):
    """One row per chapter per class meeting, with a stable id.

    Stable because it is built from the schedule row id plus the chapter number,
    so progress.csv keeps pointing at the right thing across regenerations.

    Exam-scope chapters are NOT readings. LGL225 puts "Chapters 1,2,3,6, and 7"
    in the Reading(s) column of its mid-term row -- that is the scope of the
    exam, not five chapters newly assigned that week. Counting them would invent
    reading you never had, and hand you checkboxes for it.

    The test is deliberately narrow: skip only when the row's chapters are
    exactly the matching assessment's stated scope. LGL152 also holds tests on
    days that carry genuine new reading (Midterm #1 with chapter 13), and those
    must survive.
    """
    scope_by_week = {}
    for a in assessments:
        if a.get("scope_chapters") and a.get("week_no") != "":
            scope_by_week[(a["course"], a["week_no"])] = set(a["scope_chapters"].split(";"))

    out = []
    for r in schedule:
        if r["due_type"] == "study_week":
            continue
        chapters = [c for c in r["chapters"].split(";") if c]
        pages = [p for p in r["pages"].split(";") if p]
        if not chapters:
            continue
        if r["due_type"] in ("exam", "test"):
            scope = scope_by_week.get((r["course"], r["week_no"]))
            if scope and scope == set(chapters):
                continue
        per_chapter, unpaired = pair_pages(r["reading_raw"], chapters, pages)
        for ch in chapters:
            out.append({
                "id": f"{r['id']}-ch{ch}",
                "course": r["course"],
                "class_date": r["class_date"],
                "week_no": int(r["week_no"]),
                "chapter": ch,
                "pages": per_chapter.get(ch, ""),
                "all_pages": unpaired,
                "topic": r["topic"],
                "reading_raw": r["reading_raw"],
                "schedule_id": r["id"],
            })
    return out


# The closing bracket is optional at the end of the cell: LGL151 week 5 prints
# "Chapter 10 (pgs 295-298" and stops, and without that tolerance the range
# was dropped on the floor.
_CH_PAGES = re.compile(
    r"Chapters?\s*(\d+)\s*\(\s*\*?\s*(?:pgs?|pages?|pp)\.?\s*([\d\s;,\-–]+?)\s*(?:\)|$)", re.I)


def pair_pages(reading_raw, chapters, pages):
    """Which page range belongs to which chapter -- in the syllabus's own words.

    Returns ({chapter: "a-b;c-d"}, unpaired) where unpaired is the ranges that
    could not be attached to a chapter, joined with ";", or "".

    Three cases, in order:
      1. One range per chapter: positional, as printed.
      2. One chapter: every range is its range.
      3. The cell names the chapter beside its pages -- "Chapter 3 (pp. 65-79)",
         "Chapter 5 (pgs 144-145) Chapter 3 (pgs 60-62)" -- so read that. This
         is not a guess; it is the printed attachment. Chapters the cell gives
         no pages for get none.
    Anything else stays unpaired and is shown once for the class, never
    stamped on every chapter: "ch 1 class pp. 65-79" read as Chapter 1's
    pages, which the syllabus never said.
    """
    if not pages:
        return {}, ""
    if len(pages) == len(chapters):
        return dict(zip(chapters, pages)), ""
    if len(chapters) == 1:
        return {chapters[0]: ";".join(pages)}, ""
    found = {}
    for m in _CH_PAGES.finditer(reading_raw or ""):
        ch = m.group(1)
        if ch not in chapters:
            continue
        rng = re.sub(r"\s+", "", m.group(2)).replace("–", "-").replace(",", ";").strip(";")
        found.setdefault(ch, []).append(rng)
    if found:
        # Any range the cell did NOT attach to a chapter stays visible as
        # unpaired. Dropping it would be the silent loss this project exists
        # to prevent.
        claimed = {r for v in found.values() for r in ";".join(v).split(";")}
        leftover = [p for p in pages if p not in claimed]
        return {ch: ";".join(v) for ch, v in found.items()}, ";".join(leftover)
    return {}, ";".join(pages)


def monday_of(iso):
    d = dt.date.fromisoformat(iso)
    return (d - dt.timedelta(days=d.weekday())).isoformat()


def resolve_due(a):
    """The date to sort and count down against.

    An exact date stands as it is. A WEEK-precision item resolves to the MONDAY
    of the week it names -- never to the date the syllabus happened to print in
    that row. Eleven rows print their course's own class day instead of a
    Monday (LGL152 Thursdays, LGL156 and LGL160 Wednesdays), and taking those
    literally slid the whole window late, because the client adds six days to
    this value to find the last day of the week. LGL160's quiz, sat on Wed
    23 Sept, still read "3 days left" on Sat 26 Sept -- its window had been
    stretched to Tue 29 Sept, four days into the following week. Rafael caught
    it against the Weekly Calendar, which places items by week number and was
    therefore right all along.

    The printed date stays untouched in due_week_of. validate.py matches that
    value against the course's real class row, which is the check that catches
    an item filed on the wrong week -- it is not ours to normalise away.
    """
    if a["date_precision"] == "unknown":
        # Not undated -- the syllabus DOES print a date; it just is not this
        # student's. LGL151's presentations begin the week of 28 Sept and run
        # on from there, one slot per student, posted to Blackboard. Counting
        # down to the start of the run would name a day nobody has given him.
        # due_week_of keeps the printed date so rule 8 can still match the row
        # and prove it carries its 15%; the weight still counts toward the 100.
        return ""
    if a["due_date"]:
        return a["due_date"]
    if a["due_week_of"]:
        return monday_of(a["due_week_of"])
    return ""


def notes_index():
    out = []
    if not NOTES.exists():
        return out
    for p in sorted(NOTES.rglob("*.md")):
        rel = p.relative_to(NOTES).as_posix()
        text = p.read_text(encoding="utf-8", errors="replace")
        meta = {}
        m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.S)
        if m:
            for line in m.group(1).splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip().strip('"').strip("'")
        out.append({
            "path": rel,
            "course": meta.get("course") or (rel.split("/")[0] if "/" in rel else ""),
            "title": meta.get("title") or p.stem,
            "week_of": meta.get("week_of", ""),
            "chapter": meta.get("chapter", ""),
            "topic": meta.get("topic", ""),
            "tags": meta.get("tags", ""),
            "words": len(text.split()),
            "modified": dt.datetime.fromtimestamp(p.stat().st_mtime).isoformat(timespec="seconds"),
        })
    return out


def build_payload():
    schedule = read_csv("schedule.csv")
    for r in schedule:
        r["week_no"] = int(r["week_no"]) if r["week_no"] else week_no(r["class_date"])
    assessments = read_csv("assessments.csv")
    for a in assessments:
        a["due_resolved"] = resolve_due(a)
        a["week_no"] = week_no(a["due_resolved"]) if a["due_resolved"] else ""
        a["lead_days"] = LEAD_DAYS.get(a["type"], LEAD_DAYS[""])
    return {
        "term": TERM,
        "today": dt.date.today().isoformat(),
        "generated": dt.datetime.now().isoformat(timespec="seconds"),
        "courses": read_csv("courses.csv"),
        "schedule": schedule,
        "assessments": assessments,
        "readings": derive_readings(schedule, assessments),
        "progress": read_csv("progress.csv"),
        "grades": read_csv("grades.csv"),
        "cases": read_csv("cases.csv"),
        # Rafael's own Block NF timetable, transcribed 25 Sep 2026. It is NOT
        # derived from the syllabi and it contradicts three of them -- see the
        # note column on each row and data/changes.md.
        "timetable": read_csv("timetable.csv"),
        "notes": notes_index(),
        "syllabi": sorted(p.name for p in SYLLABI.glob("*")) if SYLLABI.exists() else [],
    }


# --------------------------------------------------------------- note writing
def safe_segment(s, fallback="untitled"):
    s = re.sub(r"[^A-Za-z0-9._-]+", "-", (s or "").strip()).strip("-.")
    return s[:80] or fallback


def note_path(rel):
    """Resolve a note path, refusing anything that escapes notes/."""
    p = (NOTES / rel).resolve()
    if not str(p).startswith(str(NOTES.resolve())):
        raise ValueError("path outside notes/")
    return p


# ------------------------------------------------------------------- handler
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if "--verbose" in os.sys.argv:
            super().log_message(fmt, *args)

    # -- helpers
    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        raw = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        return json.loads(self.rfile.read(n).decode("utf-8"))

    def _static(self, path, ctype):
        if not path.exists():
            return self._send(404, {"error": f"{path.name} not found"})
        self._send(200, path.read_bytes(), ctype)

    # -- GET
    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        route = url.path

        if route in ("/", "/index.html"):
            return self._static(APP / "index.html", "text/html; charset=utf-8")
        if route == "/app.css":
            return self._static(APP / "app.css", "text/css; charset=utf-8")
        if route == "/app.js":
            return self._static(APP / "app.js", "application/javascript; charset=utf-8")
        # The first asset this server has ever served, added 27 Sep 2026 for the
        # mobile design. Windows has Bahnschrift and never fetches this; a phone
        # has neither Bahnschrift nor Segoe UI Variable, so without it the app
        # falls all the way through to the system font and stops looking like
        # itself. One variable file covers 400-800. Named explicitly rather than
        # opening a directory: this stays a three-file server with one exception,
        # not a static host.
        if route == "/archivo.woff2":
            return self._static(APP / "archivo.woff2", "font/woff2")
        if route == "/api/data":
            return self._send(200, build_payload())
        if route == "/api/note":
            rel = (q.get("path") or [""])[0]
            try:
                p = note_path(rel)
            except ValueError:
                return self._send(400, {"error": "bad path"})
            if not p.exists():
                return self._send(404, {"error": "no such note"})
            return self._send(200, {"path": rel, "text": p.read_text(encoding="utf-8",
                                                                     errors="replace")})
        return self._send(404, {"error": "not found"})

    # -- POST
    def do_POST(self):
        route = urllib.parse.urlparse(self.path).path
        try:
            body = self._body()
        except json.JSONDecodeError:
            return self._send(400, {"error": "body is not valid JSON"})

        if route == "/api/progress":
            rid = body.get("reading_id")
            if not rid:
                return self._send(400, {"error": "reading_id required"})
            status = body.get("status", "")
            if status not in ("", "not_started", "in_progress", "done"):
                return self._send(400, {"error": f"bad status {status!r}"})
            # "not_started" is the absence of progress, so it normalises to empty
            # and the row is dropped entirely -- otherwise un-ticking a chapter
            # leaves a ghost row behind that only looks like data.
            status = "" if status == "not_started" else status
            rec = {"reading_id": rid,
                   "status": status,
                   "updated": dt.date.today().isoformat() if status else "",
                   "minutes": str(body.get("minutes") or "") if status else "",
                   "note": body.get("note", "") if status else ""}
            upsert("progress.csv", ["reading_id", "status", "updated", "minutes", "note"],
                   "reading_id", rec)
            return self._send(200, {"ok": True, "progress": read_csv("progress.csv")})

        if route == "/api/grade":
            aid = body.get("assessment_id")
            if not aid:
                return self._send(400, {"error": "assessment_id required"})
            earned = str(body.get("earned_pct") or "").strip()
            if earned:
                try:
                    v = float(earned)
                except ValueError:
                    return self._send(400, {"error": "earned_pct must be a number"})
                if not 0 <= v <= 100:
                    return self._send(400, {"error": "earned_pct must be 0-100"})
                earned = f"{v:g}"
            rec = {"assessment_id": aid, "earned_pct": earned,
                   "returned_date": body.get("returned_date") or
                   (dt.date.today().isoformat() if earned else ""),
                   "note": body.get("note", "")}
            upsert("grades.csv", ["assessment_id", "earned_pct", "returned_date", "note"],
                   "assessment_id", rec)
            return self._send(200, {"ok": True, "grades": read_csv("grades.csv")})

        if route == "/api/case":
            cid = body.get("id") or f"case-{dt.datetime.now().strftime('%Y%m%d%H%M%S')}"
            fields = ["id", "course", "style_of_cause", "citation", "canlii_url", "court",
                      "year", "week_of", "status", "verified", "note"]
            rec = {k: str(body.get(k, "")) for k in fields}
            rec["id"] = cid
            if body.get("_delete"):
                rec = {"id": cid}
            upsert("cases.csv", fields, "id", rec)
            return self._send(200, {"ok": True, "cases": read_csv("cases.csv")})

        if route == "/api/note":
            course = safe_segment(body.get("course"), "GENERAL")
            title = (body.get("title") or "").strip() or "Untitled"
            rel = body.get("path")
            if rel:
                try:
                    p = note_path(rel)
                except ValueError:
                    return self._send(400, {"error": "bad path"})
            else:
                week_of = body.get("week_of") or dt.date.today().isoformat()
                stem = f"{week_of}-{safe_segment(title)}"
                p = NOTES / course / f"{stem}.md"
                rel = p.relative_to(NOTES).as_posix()
            p.parent.mkdir(parents=True, exist_ok=True)

            if body.get("text") is not None:
                p.write_text(body["text"], encoding="utf-8")
            elif not p.exists():
                fm = [
                    "---",
                    f"title: {title}",
                    f"course: {course}",
                    f"week_of: {body.get('week_of', '')}",
                    f"chapter: {body.get('chapter', '')}",
                    f"topic: {(body.get('topic') or '')[:200]}",
                    "tags:",
                    "---",
                    "",
                    f"# {title}",
                    "",
                    "## Rule",
                    "",
                    "## Elements / test",
                    "",
                    "## Exceptions",
                    "",
                    "## Cases",
                    "",
                    "## Questions for the professor",
                    "",
                ]
                p.write_text("\n".join(fm), encoding="utf-8")
            return self._send(200, {"ok": True, "path": rel,
                                    "text": p.read_text(encoding="utf-8", errors="replace")})

        if route == "/api/open":
            # Open a source PDF or note in whatever the OS uses for it. Convenience
            # only -- confined to syllabi/, handouts/ and notes/.
            rel = body.get("path", "")
            target = (ROOT / rel).resolve()
            allowed = [ (ROOT / d).resolve() for d in ("syllabi", "handouts", "notes", "data") ]
            if not any(str(target).startswith(str(a)) for a in allowed) or not target.exists():
                return self._send(400, {"error": "refused"})
            try:
                os.startfile(str(target))       # noqa: S606  (Windows only)
            except Exception as e:               # pragma: no cover
                return self._send(500, {"error": str(e)})
            return self._send(200, {"ok": True})

        return self._send(404, {"error": "not found"})


class Server(socketserver.ThreadingTCPServer):
    # NOT allow_reuse_address. On Windows SO_REUSEADDR lets a second process bind
    # a port that is already being listened on, instead of failing -- so starting
    # the app twice leaves two servers on 8787 and whichever answers first wins.
    # That surfaces as edits to data/ apparently having no effect. Better to
    # refuse the second start and say so.
    allow_reuse_address = False
    daemon_threads = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    for required in ("courses.csv", "schedule.csv", "assessments.csv"):
        if not (DATA / required).exists():
            raise SystemExit(f"data/{required} is missing -- nothing to serve.")
    NOTES.mkdir(exist_ok=True)

    url = f"http://127.0.0.1:{args.port}/"
    try:
        httpd = Server(("127.0.0.1", args.port), Handler)
    except OSError:
        raise SystemExit(
            f"Port {args.port} is already in use -- Paralegal Beagle is probably already\n"
            f"running. Open {url} in your browser, or close the other window first.\n"
            f"To run a second copy anyway:  python serve.py --port {args.port + 1}")

    with httpd:
        p = build_payload()
        print("Paralegal Beagle", flush=True)
        print(f"  {len(p['courses'])} courses | {len(p['schedule'])} class meetings | "
              f"{len(p['assessments'])} assessments | {len(p['readings'])} chapter-readings", flush=True)
        print(f"  serving {url}   (Ctrl+C to stop)", flush=True)
        if not args.no_browser:
            threading.Timer(0.4, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()
