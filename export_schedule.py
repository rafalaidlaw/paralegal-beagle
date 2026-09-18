# -*- coding: utf-8 -*-
"""Hand Beagle's calendar to the paralegal wiki, one file per course.

    python export_schedule.py                 # write ../paralegal-wiki/context/
    python export_schedule.py --check         # say what would change, write nothing
    python export_schedule.py --wiki PATH     # a wiki repo somewhere else

WHY THIS EXISTS
---------------
The wiki knows the law; this project knows the calendar. Its LGL250 Week 2 page
had to admit it did not know the real class date and used the ingest date
instead -- Beagle knew all along that the class was Tue 15 Sept 2026, covering
chapter 5, pp. 107-116, LSO competencies 202 and 204. So: export what Beagle
knows, in the wiki's own vocabulary, and let its Ingest workflow look it up.

The direction is one-way on purpose. This script READS data/*.csv and WRITES
only inside <wiki>/context/. It never touches wiki/ -- those pages belong to
the wiki's own CLAUDE.md, and two writers is how a vault starts contradicting
itself.

It reuses serve.py rather than re-deriving anything: same readings, same week
numbers, same two-horizon deadline resolution the app shows. A second
derivation of the same facts is a second answer waiting to disagree.

The class list is READ FROM THE WIKI's CLAUDE.md section 3, not hardcoded here.
The wiki decides which courses it covers (it excludes LGL154 on purpose); this
script follows. If that table cannot be found it stops rather than guessing.

Output is deterministic: the same data produces byte-identical files, so a
re-run with nothing changed leaves `git status` clean in the wiki repo.
"""
import argparse
import hashlib
import io
import re
import subprocess
import sys
import datetime as dt
from pathlib import Path

import serve                      # constants + read_csv + build_payload

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent
DEFAULT_WIKI = ROOT.parent / "paralegal-wiki"

DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
       "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"]       # "Sept", as everywhere else


def fmt_date(iso):
    d = dt.date.fromisoformat(iso)
    return f"{DOW[d.weekday()]} {d.day} {MON[d.month - 1]} {d.year}"


def listy(s):
    """"1;3" -> "1, 3" """
    return ", ".join(x for x in str(s or "").split(";") if x)


def classes_from_schema(wiki_root):
    """The controlled vocabulary in the wiki's CLAUDE.md section 3.

    Rows look like:   | `lgl151` | Introduction to the Legal System ... |
    Returns {"LGL151": "lgl151", ...}. Stops rather than guessing if the
    section is missing -- inventing a class folder is exactly what the wiki's
    own rules forbid.
    """
    schema = wiki_root / "CLAUDE.md"
    if not schema.exists():
        raise SystemExit(f"No CLAUDE.md at {schema} -- is --wiki pointing at the wiki repo root?")
    text = schema.read_text(encoding="utf-8")
    out = {}
    for slug in re.findall(r"^\|\s*`([a-z]{3}\d{3})`\s*\|", text, re.M):
        out[slug.upper()] = slug
    if not out:
        raise SystemExit(
            f"Could not find the class table in {schema} (section 3).\n"
            "It should hold rows like:  | `lgl151` | Introduction to the Legal System ... |\n"
            "Fix the schema or the pattern here; do not let this script invent class names.")
    return out


def provenance():
    """Name the exact data this came from, without a wall clock.

    A timestamp would make every run a diff. The commit plus a digest of the
    three source CSVs changes only when the data does.
    """
    sources = ["courses.csv", "schedule.csv", "assessments.csv"]
    paths = [f"data/{n}" for n in sources]
    try:
        # The last commit that touched THESE FILES, not HEAD. Naming HEAD made
        # every unrelated commit here rewrite all eight files in the wiki repo,
        # which is the opposite of the point.
        sha = subprocess.run(["git", "log", "-1", "--format=%h", "--"] + paths, cwd=ROOT,
                             capture_output=True, text=True, check=True).stdout.strip() or "none"
        # Only the three files this reads. progress.csv changes every time Rafael
        # ticks a chapter, and that must not make every export read as provisional.
        dirty = subprocess.run(["git", "status", "--porcelain", "--"] + paths,
                               cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
        commit = f"{sha}{' plus uncommitted edits' if dirty else ''}"
    except Exception:
        commit = "unknown (not a git checkout)"
    h = hashlib.sha256()
    for name in sources:
        h.update((serve.DATA / name).read_bytes())
    return commit, h.hexdigest()[:12]


def course_page(code, slug, D, commit, digest):
    c = next((x for x in D["courses"] if x["code"] == code), None)
    if c is None:
        return None
    meetings = sorted((r for r in D["schedule"] if r["course"] == code),
                      key=lambda r: (r["class_date"], r["id"]))
    items = sorted((a for a in D["assessments"] if a["course"] == code),
                   key=lambda a: (a["due_resolved"] or "9999", a["name"]))
    reads = [r for r in D["readings"] if r["course"] == code]

    L = []
    L.append("<!-- GENERATED BY PARALEGAL BEAGLE -- DO NOT EDIT BY HAND. -->")
    L.append(f"# {code} — {c['name']}")
    L.append("")
    L.append(f"Generated by `export_schedule.py` in Paralegal Beagle from `data/*.csv` "
             f"(commit `{commit}`, data `{digest}`).")
    L.append("**Beagle is the authority for every date, week number, chapter and deadline below.** "
             "If one is wrong, fix `data/schedule.csv` or `data/assessments.csv` there, record the "
             "change in `data/changes.md` with the authority you heard it from, run `python "
             "validate.py`, then re-run the export. Never edit this file: the next export "
             "overwrites it.")
    L.append("")
    L.append("## The course")
    L.append("")
    L.append(f"- **Instructor:** {c['instructor'] or '*not named in the syllabus*'}"
             + (f" ({c['email']})" if c.get("email") else ""))
    L.append(f"- **Meets:** {c['meeting_days'] or '*not stated*'}"
             + (f" — {c['mode']}" if c.get("mode") else ""))
    L.append(f"- **Textbook:** {c['textbook'] or '*not named in the syllabus*'}"
             + (f" — {c['textbook_author']}" if c.get("textbook_author") else ""))
    teaching = [r for r in meetings if r["due_type"] != "study_week"]
    breaks = len(meetings) - len(teaching)
    L.append(f"- **Class meetings:** {len(teaching)}"
             + (f" (plus {breaks} study-week row{'s' if breaks != 1 else ''})" if breaks else "")
             + f"   **Graded items:** {len(items)}   **Chapter readings:** {len(reads)}")
    if c.get("note"):
        L.append(f"- **Note:** {c['note']}")
    L.append("")
    L.append("## Class meetings")
    L.append("")
    L.append("Use these when ingesting a lecture for this course: match the lecture to its meeting, "
             "then take `session_date`, the week number and the assigned chapters from here rather "
             "than guessing. The suggested filename follows the wiki's own naming rule "
             "(`<YYYY-MM-DD>-<slug>.md`).")
    L.append("")
    for r in meetings:
        chs = [x for x in reads if x["schedule_id"] == r["id"]]
        L.append(f"### Week {r['week_no']} — {fmt_date(r['class_date'])}")
        L.append("")
        if r["due_type"] == "study_week":
            L.append("- **Study week — no class.**")
        else:
            L.append(f"- **Topic:** {r['topic'] or '*none given*'}")
            if chs:
                bits = [f"ch {x['chapter']}" + (f" (pp. {listy(x['pages'])})" if x["pages"] else "")
                        for x in chs]
                L.append(f"- **Assigned reading:** {'; '.join(bits)}")
                if chs[0].get("all_pages"):
                    L.append(f"- **Pages given without a chapter:** {listy(chs[0]['all_pages'])}")
            else:
                L.append(f"- **Assigned reading:** {r['reading_raw'] or '*none listed*'}")
            if r["lso_nums"]:
                L.append(f"- **LSO competencies:** {listy(r['lso_nums'])}")
            if r["due_item"]:
                L.append(f"- **Due at this class:** {r['due_item']}"
                         + (f" ({r['weight_pct']}%)" if r["weight_pct"] else ""))
            L.append(f"- **Verbatim syllabus wording:** date `{r['date_raw']}`"
                     + (f", reading `{r['reading_raw']}`" if r["reading_raw"] else ""))
            L.append(f"- **Suggested source page:** "
                     f"`wiki/{slug}/sources/{r['class_date']}-<slug>.md`")
            if r["note"]:
                L.append(f"- **Note:** {r['note']}")
            if r["confidence"] and r["confidence"] != "high":
                L.append(f"- **Confidence `{r['confidence']}`** — check this row against the PDF "
                         f"before relying on it.")
        L.append("")
    L.append("## Graded items")
    L.append("")
    L.append("| Item | Type | When | Weight | Scope stated in the syllabus |")
    L.append("|---|---|---|---:|---|")
    for a in items:
        when = ("*no date*" if not a["due_resolved"]
                else fmt_date(a["due_resolved"]) if a["date_precision"] == "exact"
                else f"week of {fmt_date(a['due_resolved'])}")
        scope = (f"chapters {listy(a['scope_chapters'])}" if a["scope_chapters"]
                 else "**not stated — ask the professor**")
        L.append(f"| {a['name']} | {a['type']} | {when} | "
                 f"{a['weight_pct'] + '%' if a['weight_pct'] else '—'} | {scope} |")
    L.append("")
    L.append("An exam whose scope is not stated has **not** been inferred here, and must not be "
             "inferred in the wiki either. Ask the professor, then record the answer in Beagle's "
             "`data/assessments.csv` and `data/changes.md`.")
    L.append("")
    return "\n".join(L)


def readme(classes, commit, digest):
    L = [
        "<!-- GENERATED BY PARALEGAL BEAGLE -- DO NOT EDIT BY HAND. -->",
        "# context/ — the calendar, from Paralegal Beagle",
        "",
        "These files are **generated**, one per class, by `export_schedule.py` in the Paralegal "
        "Beagle project (`../Paralegal-Beagle`). They are not raw sources and not wiki pages: "
        "they are reference material for the Ingest workflow, so a source page can carry the real "
        "class date, week number and assigned chapters instead of a guess.",
        "",
        f"Built from Beagle's `data/*.csv` at commit `{commit}` (data `{digest}`).",
        "",
        "## The rule",
        "",
        "**Beagle owns the calendar; this wiki owns the law.** Dates, week numbers, assigned "
        "chapters, deadlines, weights and LSO competency numbers are Beagle's, extracted from the "
        "syllabi once and checked by its `validate.py`. Doctrine, cases, statutes and analysis are "
        "the wiki's. Neither stores the other's facts.",
        "",
        "So: never correct a date by editing a file here — the next export overwrites it. Correct "
        "it in Beagle's `data/`, note the authority in its `data/changes.md`, run `python "
        "validate.py`, then re-run `python export_schedule.py`.",
        "",
        "## What is here",
        "",
    ]
    for code, slug in sorted(classes.items()):
        L.append(f"- [`{slug}.md`]({slug}.md) — {code}")
    L.append("")
    L.append("LGL154 (Computer Applications) is absent because the wiki's `CLAUDE.md` section 3 "
             "leaves it out. This folder follows that list; it does not keep its own.")
    L.append("")
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--wiki", default=str(DEFAULT_WIKI),
                    help="the wiki REPO root (the folder holding CLAUDE.md and wiki/)")
    ap.add_argument("--check", action="store_true",
                    help="report what would change and write nothing")
    args = ap.parse_args()

    wiki_root = Path(args.wiki).expanduser().resolve()
    if not wiki_root.exists():
        raise SystemExit(f"No wiki at {wiki_root}. Pass --wiki with the right path.")
    classes = classes_from_schema(wiki_root)
    commit, digest = provenance()
    D = serve.build_payload()

    known = {c["code"] for c in D["courses"]}
    missing = sorted(set(classes) - known)
    if missing:
        raise SystemExit(f"The wiki lists {', '.join(missing)}, which Beagle has no data for. "
                         "Fix the schema's class table or add the course to data/courses.csv.")

    out_dir = wiki_root / "context"
    files = {"README.md": readme(classes, commit, digest)}
    for code, slug in sorted(classes.items()):
        page = course_page(code, slug, D, commit, digest)
        if page:
            files[f"{slug}.md"] = page

    changed, same, new = [], [], []
    for name, text in sorted(files.items()):
        p = out_dir / name
        if not p.exists():
            new.append(name)
        elif p.read_text(encoding="utf-8") != text:
            changed.append(name)
        else:
            same.append(name)

    if args.check:
        print(f"wiki: {wiki_root}")
        print(f"data: commit {commit}, digest {digest}")
        for label, group in (("new", new), ("would change", changed), ("unchanged", same)):
            if group:
                print(f"  {label}: {', '.join(group)}")
        print("\nnothing was written (--check).")
        return

    out_dir.mkdir(parents=True, exist_ok=True)
    for name, text in files.items():
        (out_dir / name).write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {len(files)} files to {out_dir}")
    print(f"  {len(new)} new, {len(changed)} changed, {len(same)} already up to date")
    print(f"  data: commit {commit}, digest {digest}")
    if not new and not changed:
        print("  (nothing moved -- the wiki repo's git status is unchanged)")


if __name__ == "__main__":
    main()
