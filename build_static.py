# -*- coding: utf-8 -*-
"""Build dist/ -- the publishable copy of the app, for Netlify.

    python build_static.py            # write dist/
    python build_static.py --check    # say what would change, write nothing

There is no build step for the local app: `python serve.py` reads the CSVs on
every request and a refresh is the build. This script exists only because a
static host has no server to do that, so the payload has to be frozen into a
file beside the page.

WHAT GOES IN, AND WHAT DELIBERATELY DOES NOT
--------------------------------------------
dist/ holds four files and nothing else. A Netlify URL is public -- anyone who
guesses paralegalbeagle.netlify.app can read every byte of it -- so this script
names what it copies rather than copying a folder. Never change it to "copy
everything and exclude some".

Kept OUT on purpose, and each for its own reason:

  syllabi/          Seneca's course outlines, including one pulled from behind
                    Rafael's student login. Institutional copyright; publishing
                    them is a different question from keeping them on disk, and
                    the answer has not been asked.
  handouts/         same.
  reference/        holds his integrity-in-action certificate, with his name.
  data/grades.csv   his marks.
  data/cases.csv    his own case briefs.
  data/progress.csv which chapters HE has read. The published site is usable by
                    anyone, and a stranger opening it should not find somebody
                    else's reading already crossed off -- nor should they be
                    able to see it. Their own ticks live in their own browser
                    (see withLocalTicks in app.js), which also means Rafael's
                    phone and his laptop keep separate lists. That is the
                    honest trade: no server, no shared state.
  notes/            his reading notes.
  data/*.csv        the source files themselves. The payload is derived from
                    them; the files are the working copy and stay private.

data.json therefore carries only the syllabus facts the three published
screens draw: courses, schedule, assessments, readings, timetable and term.
Nothing about what Rafael has done. If a screen is ever switched back on that
needs grades, cases or notes, the decision to publish those has to be taken
first -- do not just add the key.

THE DATE
--------
build_payload() stamps "today", and a frozen date is worse than no date on a
screen whose whole job is counting down. The published page therefore ignores
it and reads the browser's own local date instead (see load() in app.js). The
value is left in the file so the page can show when the data was last built.
"""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"

# Exactly what the published screens draw. Anything not named here is not
# published, including keys build_payload() happens to add later.
PUBLISH_KEYS = [
    "term", "today", "generated", "courses", "schedule",
    "assessments", "readings", "timetable",
]

# Read by the client, but NOT published: grades and case briefs are his, notes
# are his writing, and syllabi is a list of Seneca's PDFs. They ship as empty
# arrays rather than being dropped, because the sidebar counts and the Review
# queue read .length off each of them on first paint -- omitting a key crashed
# the published page before its first render, which is how this list was found.
# An empty array is also the truth on a copy that cannot save any of them.
EMPTY_KEYS = ["grades", "cases", "notes", "syllabi", "progress"]

PAGES = [("app/index.html", "index.html"), ("app/app.css", "app.css"), ("app/app.js", "app.js")]

ROBOTS = """User-agent: *
Disallow: /
"""

# Netlify reads this at deploy time. noindex is belt and braces with robots.txt:
# robots.txt asks a crawler not to fetch, the header tells one that fetched
# anyway not to keep it.
HEADERS = """/*
  X-Robots-Tag: noindex, nofollow, noarchive
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
"""


def payload():
    sys.path.insert(0, str(ROOT))
    import serve                                   # noqa: E402  (needs ROOT on the path)
    full = serve.build_payload()
    missing = [k for k in PUBLISH_KEYS if k not in full]
    if missing:
        sys.exit(f"build_payload() no longer returns {', '.join(missing)} -- "
                 f"check PUBLISH_KEYS in build_static.py before publishing anything.")
    out = {k: full[k] for k in PUBLISH_KEYS}
    out.update({k: [] for k in EMPTY_KEYS})
    return out


def commit():
    """Name the commit the app files came from, so a deploy is traceable."""
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%h"], cwd=ROOT,
                             capture_output=True, text=True, check=True)
        dirty = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT,
                               capture_output=True, text=True, check=True)
        return out.stdout.strip() + (" plus uncommitted edits" if dirty.stdout.strip() else "")
    except Exception:
        return "unknown"


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="report, write nothing")
    args = ap.parse_args()

    want = {name: (ROOT / src).read_bytes() for src, name in PAGES}
    want["data.json"] = json.dumps(payload(), indent=1, ensure_ascii=False).encode("utf-8")
    want["robots.txt"] = ROBOTS.encode("utf-8")
    want["_headers"] = HEADERS.encode("utf-8")

    if args.check:
        print(f"dist: {DIST}")
        for name, blob in sorted(want.items()):
            p = DIST / name
            state = "new" if not p.exists() else ("same" if p.read_bytes() == blob else "changed")
            print(f"  {state:8} {name}  ({len(blob):,} bytes)")
        extra = sorted(p.name for p in DIST.glob("*")) if DIST.exists() else []
        for name in extra:
            if name not in want:
                print(f"  {'REMOVE':8} {name}  (not published by this script)")
        print("\nnothing was written (--check).")
        return

    # Rebuild the folder rather than writing into it: a file that stopped being
    # published must stop being served, and "still there from last time" is how
    # something private gets left behind.
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    for name, blob in want.items():
        (DIST / name).write_bytes(blob)

    total = sum(len(b) for b in want.values())
    print(f"wrote {len(want)} files to {DIST}  ({total:,} bytes)")
    print(f"  app files from commit {commit()}")
    print(f"  data.json: {len(want['data.json']):,} bytes, "
          f"{len(json.loads(want['data.json'])['assessments'])} assessments")
    print("  nothing from syllabi/, handouts/, reference/, notes/, or data/*.csv")


if __name__ == "__main__":
    main()
