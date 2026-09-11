"""Convert every source syllabus into a plain-text dump under build/.

These dumps are the evidence layer: validate.py checks that the verbatim
`date_raw` / `reading_raw` strings recorded in data/schedule.csv actually occur
in the dump for their `source_file`. That makes fabricated rows mechanically
detectable.

PDFs go through `pdftotext -table` on purpose. The `pdftotext` on this machine is
xpdf 4.00 (Git-for-Windows, /mingw64/bin) -- NOT poppler, so `-bbox-layout` does
not exist. Six of the eight syllabi are Courseleaf/Apache-FOP output whose "Due"
column cells float free of their rows; `-layout` collapses them onto the first
row and silently detaches the date column. `-table` reconstructs the columns.

    Verified example, LGL152 Midterm Test #1:
        pdftotext -layout  -> week of 11/12   (wrong by six weeks)
        pdftotext -table   -> week of 10/1    (correct)

Run:  python extract.py
"""

import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SYLLABI = ROOT / "syllabi"
HANDOUTS = ROOT / "handouts"
BUILD = ROOT / "build"

# source filename -> course code. Filenames are inconsistent and some carry
# stale Word metadata (Presentation Instructions still claims "CRT417 ADVOCACY
# SUMMER 2001"), so this mapping was confirmed from page 1 of each document.
SOURCES = {
    "LGL151 Syllabus -Fall 2026.pdf": "LGL151",
    "Contracts and Torts Syllabus Fall 2026.pdf": "LGL152",
    "LGL153NPF Syllabus Fall 2026.docx": "LGL153",
    "lgl154-npf-Fall 2026 Syllabus.pdf": "LGL154",
    "LGL 156 Syllabus - Fall 2026.pdf": "LGL156",
    "CourseOutline_Syllabus.pdf": "LGL160",
    "syllabi-2267-lgl225-npf-5370-loggedin.pdf": "LGL225",
    "LGL 250 SPF 26-3 Courseleaf Syllabus.pdf": "LGL250",
}

HANDOUT_SOURCES = {
    "Presentation Instructions - Fall 2026.pdf": "presentation-instructions",
    "Activity_ Immigration Reference Toolkit _ Fall_ 2026(1).docx": "immigration-toolkit",
}

# Deliberately never parsed: a CanCred open-badge PDF with no schedule in it. A
# bare *.pdf glob would feed it to the parser and a model would invent a
# schedule from it.
IGNORE = {"2026-09-11_integrity-in-action.pdf"}


def pdf_to_text(src: Path, dest: Path) -> None:
    exe = shutil.which("pdftotext")
    if not exe:
        sys.exit(
            "pdftotext not found on PATH.\n"
            "It ships with Git for Windows at /mingw64/bin/pdftotext.exe -- run this\n"
            "from Git Bash, or add that directory to PATH."
        )
    subprocess.run([exe, "-table", "-enc", "UTF-8", str(src), str(dest)], check=True)


def docx_to_text(src: Path, dest: Path) -> None:
    """Flatten word/document.xml, keeping table-cell and row boundaries.

    LGL153's schedule is a real Word table; without the cell separators the
    date, topic and reading columns run together into one unreadable line.
    """
    xml = zipfile.ZipFile(src).read("word/document.xml").decode("utf-8", "replace")
    xml = xml.replace("</w:tc>", " | </w:tc>")
    xml = xml.replace("</w:tr>", "\n</w:tr>")
    xml = xml.replace("</w:p>", "\n</w:p>")
    xml = xml.replace("<w:br/>", "\n").replace("<w:tab/>", "\t")
    text = re.sub(r"<[^>]+>", "", xml)
    for entity, char in (
        ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
        ("&quot;", '"'), ("&apos;", "'"),
    ):
        text = text.replace(entity, char)
    text = re.sub(r"\n{3,}", "\n\n", text)
    dest.write_text(text, encoding="utf-8")


def convert(src: Path, stem: str) -> Path:
    dest = BUILD / f"{stem}.txt"
    if src.suffix.lower() == ".pdf":
        pdf_to_text(src, dest)
    elif src.suffix.lower() == ".docx":
        docx_to_text(src, dest)
    else:
        raise ValueError(f"don't know how to read {src.name}")
    return dest


def main() -> int:
    BUILD.mkdir(exist_ok=True)
    missing = []

    for folder, mapping in ((SYLLABI, SOURCES), (HANDOUTS, HANDOUT_SOURCES)):
        for filename, stem in mapping.items():
            src = folder / filename
            if not src.exists():
                missing.append(f"{folder.name}/{filename}")
                continue
            dest = convert(src, stem)
            body = dest.read_text(encoding="utf-8", errors="replace")
            lines = len([ln for ln in body.splitlines() if ln.strip()])
            print(f"  {stem:28s} <- {filename[:48]:48s} ({lines} lines)")

    if missing:
        print("\nMISSING SOURCE FILES -- these courses cannot be re-verified:")
        for m in missing:
            print(f"  ! {m}")
        return 1

    print(f"\nWrote {len(SOURCES) + len(HANDOUT_SOURCES)} text dumps to build/")
    print("Next: python validate.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
