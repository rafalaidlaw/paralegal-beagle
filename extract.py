"""Read each syllabus schedule table ROW BY ROW into build/<CODE>.rows.json.

Why this file is careful
------------------------
`pdftotext` reconstructs COLUMNS from whitespace, but it cannot tell you which
ROW a wrapped line belongs to. When a cell's first line is an assessment, the
flattened text puts it directly under the previous row's last line, and it reads
as though it belongs there.

That is not hypothetical. LGL151 lists "QUIZ #1 (15%)" as the first line of the
week-3 cell (Sept 21) and "PRESENTATIONS BEGIN (15%)" as the first line of the
week-4 cell (Sept 28). Flattened to text, both appear to sit at the bottom of the
preceding week, and the first version of this project recorded both a week early.

So rows are recovered from geometry instead:

* **LGL151** is a bordered Word table. Its date column sits at a fixed x across
  all three pages, so each date anchors a row and the row runs to the next date.
* **The six Courseleaf/Apache-FOP syllabi** draw no ruling lines at all. Their
  cells are top-aligned, so the same date-anchor rule works; column boundaries
  come from the x positions of the header cells ("Week of", "Agenda/Topic",
  "Reading(s)", "Due").
* **LGL153** is a .docx, where `<w:tr>` really is a row. No guessing needed.

build/<CODE>.rows.json is the authority `validate.py` checks data/schedule.csv
against -- and it checks that a value appears in the MATCHING row, not merely
somewhere in the document.

Requires pdfplumber (`pip install pdfplumber`). Only this script and validate.py
need it; serve.py stays standard-library only.

    python extract.py
"""

import json
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    sys.exit("pdfplumber is required to re-extract the syllabi:\n    pip install pdfplumber")

ROOT = Path(__file__).resolve().parent
SYLLABI = ROOT / "syllabi"
HANDOUTS = ROOT / "handouts"
BUILD = ROOT / "build"

# Confirmed from page 1 of each document, not from the filename and not from PDF
# metadata -- handouts/Presentation Instructions still carries a stale Word title
# claiming "CRT417 ADVOCACY SUMMER 2001".
SOURCES = {
    "LGL151": "LGL151 Syllabus -Fall 2026.pdf",
    "LGL152": "Contracts and Torts Syllabus Fall 2026.pdf",
    "LGL153": "LGL153NPF Syllabus Fall 2026.docx",
    "LGL154": "lgl154-npf-Fall 2026 Syllabus.pdf",
    "LGL156": "LGL 156 Syllabus - Fall 2026.pdf",
    "LGL160": "CourseOutline_Syllabus.pdf",
    "LGL225": "syllabi-2267-lgl225-npf-5370-loggedin.pdf",
    "LGL250": "LGL 250 SPF 26-3 Courseleaf Syllabus.pdf",
}

HANDOUT_SOURCES = {
    "Presentation Instructions - Fall 2026.pdf": "presentation-instructions",
    "Activity_ Immigration Reference Toolkit _ Fall_ 2026(1).docx": "immigration-toolkit",
}

# A CanCred open badge: images only, no schedule, no text layer worth parsing.
# A bare *.pdf glob would feed it to the parser and a model would invent a
# schedule from it.
IGNORE = {"2026-09-11_integrity-in-action.pdf"}

HEADER_BAND = 70        # running page headers sit at top~47; content starts ~100
COURSELEAF_DATE = re.compile(r"^\d{1,2}/\d{1,2}$")
LGL151_DATE = re.compile(r"^(Sept|Oct|Nov|Dec)\.?$")
# The schedule table is followed by the "Missed Tests/Late Assessments"
# heading. Case-SENSITIVE and exact: a case-insensitive "feedback" alternative
# truncated LGL160 mid-cell at "All student feedback due", silently losing its
# last two rows including the final exam.
STOP = re.compile(r"^Missed$")


def _rows_from_anchors(pages, is_anchor, col_bounds, col_names, anchor_col):
    """Group words into rows, each starting at a date anchor.

    Cells are top-aligned in all of these tables, so a row owns every word from
    its own date down to the next date -- including words on later pages, which
    is how a row that straddles a page break stays one row.
    """
    rows, cur = [], None
    for pno, words in pages:
        body = sorted((w for w in words if w["top"] > HEADER_BAND),
                      key=lambda w: (round(w["top"], 1), w["x0"]))
        for w in body:
            if STOP.match(w["text"]):
                return rows
            col = next((k for k in range(len(col_bounds) - 1)
                        if col_bounds[k] <= w["x0"] < col_bounds[k + 1]), len(col_names) - 1)
            if col == anchor_col and is_anchor(w):
                cur = {"date": w["text"], "page": pno,
                       "_w": {n: [] for n in col_names}}
                rows.append(cur)
                continue
            if cur is None:
                continue
            cur["_w"][col_names[col]].append((round(w["top"], 1), w["x0"], w["text"]))
    return rows


def _finish(rows, col_names, date_join=None):
    out = []
    for i, r in enumerate(rows, 1):
        cells = {}
        for n in col_names:
            ws = sorted(r["_w"][n])
            cells[n] = re.sub(r"\s+", " ", " ".join(t for _, _, t in ws)).strip()
        date = r["date"]
        if date_join:                       # LGL151's date is "Sept." + "8"
            date = f"{date} {cells.pop(date_join, '').split(' ')[0]}".strip()
        out.append({"row": i, "date": date, "page": r["page"], "cells": cells})
    return out


def read_courseleaf(path):
    """The six Apache-FOP syllabi: borderless, columns found from the header."""
    with pdfplumber.open(path) as pdf:
        pages = [(i + 1, p.extract_words()) for i, p in enumerate(pdf.pages)]

        cols = None
        for pno, words in pages:
            hit = next((w for w in words if w["text"].startswith("Agenda/Topic")), None)
            if not hit:
                continue
            header = sorted((w for w in words if abs(w["top"] - hit["top"]) < 3),
                            key=lambda w: w["x0"])
            merged, cur = [], None
            for w in header:                # "Week" + "of" is one heading
                if cur and w["x0"] - cur["x1"] < 6:
                    cur = {"text": f"{cur['text']} {w['text']}", "x0": cur["x0"], "x1": w["x1"]}
                else:
                    if cur:
                        merged.append(cur)
                    cur = {"text": w["text"], "x0": w["x0"], "x1": w["x1"]}
            if cur:
                merged.append(cur)
            cols = merged
            pages = [(p, ws) for p, ws in pages if p >= pno]
            pages[0] = (pno, [w for w in pages[0][1] if w["top"] > hit["top"] + 3])
            break
        if not cols:
            raise ValueError(f"no schedule table found in {path.name}")

        names = [c["text"] for c in cols]
        bounds = [c["x0"] - 3 for c in cols] + [10**6]
        anchor_col = names.index("Date") if "Date" in names else 0
        rows = _rows_from_anchors(pages, lambda w: COURSELEAF_DATE.match(w["text"]),
                                  bounds, names, anchor_col)
        return names, _finish(rows, names)


def _cluster(values, tol=2.0):
    out = []
    for v in sorted(values):
        if not out or v - out[-1] > tol:
            out.append(v)
    return out


def read_lgl151(path):
    """Bordered Word table -- read from its actual cell rectangles.

    Date anchoring does NOT work here: unlike the Courseleaf tables, this one
    centres its cells vertically, so the date sits in the middle of its row with
    content above and below it.

    The borders are drawn as one segment per cell rather than as full-width
    rules, so row boundaries come from the WEEK column's segments (~35pt wide).
    The topic column's segments look the same but week 5 nests a bulleted
    sub-table inside its topic cell, and those inner separators would shatter one
    week into eight rows. The week column never nests.

    Column x-boundaries are the table's own tall vertical rules.
    """
    names = ["week", "date", "topic", "reading", "lso"]
    bounds = [42.4, 78.1, 134.8, 361.6, 437.4, 504.1]
    out, n = [], 0
    with pdfplumber.open(path) as pdf:
        for pno, page in enumerate(pdf.pages, 1):
            ys = _cluster(e["top"] for e in page.edges
                          if e["orientation"] == "h" and 30 < (e["x1"] - e["x0"]) < 45)
            words = page.extract_words()
            for top, bottom in zip(ys, ys[1:]):
                if bottom - top < 8:                     # spacer between rows
                    continue
                cells = {name: [] for name in names}
                for w in words:
                    cy = (w["top"] + w["bottom"]) / 2
                    if not (top <= cy < bottom):
                        continue
                    for k in range(len(names)):
                        if bounds[k] - 2 <= w["x0"] < bounds[k + 1] - 2:
                            cells[names[k]].append((round(w["top"], 1), w["x0"], w["text"]))
                            break
                joined = {k: re.sub(r"\s+", " ", " ".join(t for _, _, t in sorted(v))).strip()
                          for k, v in cells.items()}
                if not any(joined.values()) or joined["week"].upper() == "WEEK":
                    continue
                n += 1
                date = joined.pop("date")
                out.append({"row": n, "date": date, "page": pno, "cells": joined})
    return [x for x in names if x != "date"], out


def read_docx_table(path):
    """<w:tr> is a real row, so this one needs no geometry at all."""
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8", "replace")
    names = ["week", "date", "topic", "reading", "lso"]
    out, n = [], 0
    for tr in re.findall(r"<w:tr[ >].*?</w:tr>", xml, re.S):
        cells = []
        for tc in re.findall(r"<w:tc[ >].*?</w:tc>", tr, re.S):
            txt = re.sub(r"<[^>]+>", "", tc.replace("</w:p>", " "))
            for ent, ch in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                            ("&quot;", '"'), ("&apos;", "'"), ("&#8217;", "'")):
                txt = txt.replace(ent, ch)
            cells.append(re.sub(r"\s+", " ", txt).strip())
        if not any(cells) or cells[1:2] == ["DATE"]:
            continue
        n += 1
        out.append({"row": n, "date": cells[1] if len(cells) > 1 else "", "page": 1,
                    "cells": dict(zip(names, cells + [""] * len(names)))})
    return names, out


def text_dump(src, dest):
    """Human-readable reference copy. Nice to have; not what validate.py trusts."""
    exe = shutil.which("pdftotext")
    if src.suffix.lower() == ".docx":
        xml = zipfile.ZipFile(src).read("word/document.xml").decode("utf-8", "replace")
        xml = xml.replace("</w:tc>", " | </w:tc>").replace("</w:tr>", "\n</w:tr>")
        xml = xml.replace("</w:p>", "\n</w:p>").replace("<w:br/>", "\n").replace("<w:tab/>", "\t")
        text = re.sub(r"<[^>]+>", "", xml)
        for ent, ch in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                        ("&quot;", '"'), ("&apos;", "'")):
            text = text.replace(ent, ch)
        dest.write_text(re.sub(r"\n{3,}", "\n\n", text), encoding="utf-8")
        return True
    if not exe:
        return False
    subprocess.run([exe, "-table", "-enc", "UTF-8", str(src), str(dest)], check=True)
    return True


def main():
    BUILD.mkdir(exist_ok=True)
    missing, no_pdftotext = [], False

    for code, filename in SOURCES.items():
        src = SYLLABI / filename
        if not src.exists():
            missing.append(f"syllabi/{filename}")
            continue
        if code == "LGL151":
            names, rows = read_lgl151(src)
        elif src.suffix.lower() == ".docx":
            names, rows = read_docx_table(src)
        else:
            names, rows = read_courseleaf(src)

        (BUILD / f"{code}.rows.json").write_text(
            json.dumps({"course": code, "source": filename, "columns": names, "rows": rows},
                       indent=1, ensure_ascii=False), encoding="utf-8")
        if not text_dump(src, BUILD / f"{code}.txt"):
            no_pdftotext = True
        dated = sum(1 for r in rows if r["date"])
        print(f"  {code}  {len(rows):>3} rows ({dated} dated)  <- {filename[:46]}")

    for filename, stem in HANDOUT_SOURCES.items():
        src = HANDOUTS / filename
        if src.exists():
            if not text_dump(src, BUILD / f"{stem}.txt"):
                no_pdftotext = True
        else:
            missing.append(f"handouts/{filename}")

    if no_pdftotext:
        print("\n  note: pdftotext not on PATH, so the build/*.txt reference dumps were\n"
              "  skipped. The .rows.json files -- the ones that matter -- were still written.")
    if missing:
        print("\nMISSING SOURCE FILES -- these cannot be re-verified:")
        for m in missing:
            print(f"  ! {m}")
        return 1

    print(f"\nWrote {len(SOURCES)} row tables to build/*.rows.json")
    print("Next: python validate.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
