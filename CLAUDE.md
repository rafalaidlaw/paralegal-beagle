# Paralegal Beagle — working notes for Claude

Rafael's semester tracker. Seneca Polytechnic, **Paralegal Accelerated diploma
(PLEA)**, semester 1, **Fall 2026**. He is a paralegal student, not a software
engineer — prefer plain files and short scripts over frameworks, and explain
changes in terms of his coursework, not the code.

## The one rule that matters

**`data/*.csv` is the source of truth. Everything else is derived and disposable.**

`data/schedule.csv`, `courses.csv` and `assessments.csv` were extracted from the
syllabi once and are now edited **by hand**. `progress.csv`, `grades.csv` and
`cases.csv` are written by the app as Rafael uses it — never hand-edit those
while the server is running. Readings, term weeks, grade standing and crunch
load are recomputed on every request and are never stored.

After ANY change to `data/`, run:

```
python validate.py          # must exit 0
```

## Do not do these things

- **Never auto-normalise assessment weights to 100%.** A course whose weights
  don't sum to 100 is telling you a component was missed. That mismatch is the
  cheapest integrity check in the project; spend it on a loud warning.
- **Never infer an exam's scope.** Three courses state their chapters; five don't.
  An unstated scope renders as "ask your professor" and stays that way until
  Rafael reports back what he was told.
- **Never infer page counts or reading hours.** Only LGL151, LGL160 and LGL250
  give page ranges; the rest give chapter numbers alone. Any hours estimate over
  the others would be invented.
- **Never drop an unparseable row.** Park it with `confidence: medium|low` and a
  note, so it surfaces in the Review tab. A missing row looks exactly like a free
  week — the worst failure mode here.
- **Never re-add `week_no` from the printed syllabus.** Derive it from the date.
  LGL153's syllabus prints week "13" twice.
- **Never trust a value because it appears somewhere in the syllabus.** It has to
  appear in the row with the matching date. `validate.py` rule 8 enforces this;
  it is the rule that catches an item filed on the wrong week.
- **Don't feed textbook chapters or publisher PDFs to cloud AI tools.** Seneca's
  Generative AI Policy prohibits putting third-party copyrighted material into
  unapproved GenAI applications. Work from Rafael's own notes instead.

## Term constants (verified against Seneca's Fall 2026 dates)

| | |
|---|---|
| Term | Tue 8 Sep – Wed 16 Dec 2026 |
| Week 1 Monday (for week numbering) | Mon 7 Sep — Labour Day, Seneca closed |
| Thanksgiving | Mon 12 Oct — Seneca closed |
| Study week | Mon 26 Oct – Fri 30 Oct |
| Drop Session 1 without academic penalty | Fri 13 Nov |
| Grades released | Tue 22 Dec |

Week number = `((date − 2026-09-07) // 7) + 1`, giving weeks 1–15.

## The eight courses

| Code | Title | Instructor | Meets |
|---|---|---|---|
| LGL151 | Introduction to the Legal System | Robertson Boyle | Mon |
| LGL152 | Contracts and Torts | Gilda Berger | Thu online + **Fri in person** |
| LGL153 | Legal Entities and Relationships | *not named* | Fri |
| LGL154 | Computer Applications I | Esther James-Charles | Wed 12:35 |
| LGL156 | Administrative Law | Amreen Omar | **Wed 5:10 in person** + Thu online |
| LGL160 | Legal Drafting and Communication | Dyanoosh Youssefi | Wed 2:25 |
| LGL225 | Immigration Law | Vilma Filici | Wed 8:55 online |
| LGL250 | Legal Research | Camille Sherman | **Tue 5:10 in person** + Thu online |

Dates in a syllabus are that course's own meeting weekday — *not* Mondays.
LGL153's are exact Fridays; LGL151's are Mondays; LGL152/156/250 give a "week
of" plus "during in person class", which is why those carry
`date_precision: week`. LGL152, LGL156 and LGL250 each show **two** study-week
rows, one per weekly meeting — that is correct, not a duplicate.

## Extraction, if a syllabus changes

```
pip install pdfplumber      # needed by extract.py and validate.py only
python extract.py           # syllabi/ -> build/*.rows.json  (+ .txt for reading)
python validate.py
```

**Never go back to flattened text.** `pdftotext` reconstructs columns from
whitespace but cannot tell you which ROW a wrapped line belongs to, and the first
line of a cell lands under the previous row's last line. That produced a real,
shipped error: LGL151's "QUIZ #1 (15%)" and "PRESENTATIONS BEGIN (15%)" are each
the first line of their cell, and both were recorded a week early until Rafael
caught the quiz.

`extract.py` now reads cell geometry into `build/<CODE>.rows.json`:

- **LGL151** — bordered Word table, cells centred vertically. Rows come from the
  WEEK column's border segments (~35pt wide); the topic column's look identical
  but week 5 nests a bulleted sub-table that would shatter one week into eight.
  Columns are the table's own vertical rules at x = 42.4 / 78.1 / 134.8 / 361.6 /
  437.4 / 504.1.
- **The six Courseleaf syllabi** — no ruling lines at all, cells top-aligned, so
  each date anchors a row running to the next date. Columns come from the header
  word positions.
- **LGL153** — .docx, where `<w:tr>` is a real row.

Two traps already hit and fixed, worth not re-introducing: the stop word must be
case-sensitive `^Missed$` (a case-insensitive `feedback` alternative truncated
LGL160 mid-cell at "All student feedback due", silently dropping its final exam),
and the running page header sits at top≈47 while content starts at ≈100, so
words above y=70 must be discarded or they leak into cells.

Also: assessments hide in the **topic** column, not only the `Due` column.
LGL153's tests appear *only* there (`Oct. 2 \| TEST 1: CHAPTERS 1-4 (30%)`), so a
column-driven parser finds zero assessments for that course. And a weight is
sometimes stated on the row where work is HANDED OUT rather than where it is due
(LGL225: "Assignment - 20%" on 11/11, "Assignment due" on 11/18).

`reference/2026-09-11_integrity-in-action.pdf` is an open-badge certificate with
no text layer — never parse it. `handouts/Presentation Instructions` carries
stale Word metadata claiming "CRT417 ADVOCACY SUMMER 2001"; identify documents
from page 1, not metadata.

## Running the app

```
python serve.py             # http://127.0.0.1:8787 , or double-click start.bat
```

Standard library only. Binds 127.0.0.1. Views: This Week, Term Grid, Crunch,
Exams, Courses, Notes, Cases, Review.

## Open questions — ask, don't guess

Tracked in the **Review** tab and `data/changes.md`:

1. **Five courses state no exam scope** (LGL151, LGL154, LGL156, LGL160, LGL250).
2. **`Presentation Instructions - Fall 2026.pdf` attribution.** It says 15%,
   matching LGL151's "PRESENTATIONS BEGIN (15%)", but LGL160 also runs
   presentations (10%) and says "see and follow instructions".
3. **LGL156 and LGL250 both list Thu 9:50–10:40 online.** Real clash, or alternating?
4. **LGL151 lists a class on Mon 12 Oct**, which is Thanksgiving.
5. **LGL152 Midterm #1 and LGL153 Test 1 both land Fri 2 Oct.**
6. **Textbooks unnamed** for LGL151, LGL152, LGL153. LGL152 almost certainly uses
   **two** books — contracts ch. 9–17 and torts ch. 1–8, numbering restarts.

When Rafael reports an answer, update `data/` **and** append to
`data/changes.md` with the authority (`syllabus` / `announced in class` / `LMS` /
`email` / `assumption`) and the old value.
