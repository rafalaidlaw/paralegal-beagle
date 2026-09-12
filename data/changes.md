# Change log

Append-only. One entry per change to `data/`, recording the OLD value and the
AUTHORITY for the change. When two sources disagree in November, this is how you
know which one you actually heard, and where.

Authority values worth distinguishing:

- `syllabus` — it was always in the PDF; this is a correction to an extraction error
- `announced in class` — the professor said so out loud; note the date you heard it
- `LMS` — it is posted on Learn@Seneca / Blackboard
- `email` — the professor wrote it to you
- `assumption` — you worked it out yourself. Treat as provisional until confirmed.

---

## 2026-09-11 — initial extraction

Seeded `courses.csv`, `schedule.csv` (121 class meetings) and `assessments.csv`
(35 items) from the eight syllabi in `syllabi/`. Authority: `syllabus`.

`validate.py` passes with 0 errors: all 8 courses reconcile to exactly 100%, and
all 121 schedule rows have their dates, page ranges and weights proved against
the `build/` text dumps.

Open questions recorded rather than guessed at — see the Review tab:

- **LGL225 has no syllabus-stated scope for its quiz**, and five courses
  (LGL151, LGL154, LGL156, LGL160, LGL250) state no exam scope at all.
- **`Presentation Instructions - Fall 2026.pdf` attribution is unconfirmed.** It
  says 15%, matching LGL151's "PRESENTATIONS BEGIN (15%)", but LGL160 also runs
  presentations (10%) and says "see and follow instructions".
- **LGL156 and LGL250 both list Thu 9:50–10:40 online.** Possible clash.
- **LGL151 lists a class on Mon Oct 12**, which is Thanksgiving, when Seneca is
  closed.
- **LGL152 Midterm #1 and LGL153 Test 1 both land on Fri Oct 2.**

## 2026-09-11 — LGL151 quiz and presentations corrected (off by one week)

Rafael spotted that Quiz #1 was showing in week 2 when the syllabus puts it in
week 3. He was right, and it was two rows, not one. Authority: `syllabus`.

| Item | Was | Now |
|---|---|---|
| LGL151 Quiz #1 (15%) | week 2, Sept 14 | **week 3, Sept 21** |
| LGL151 Presentations begin (15%) | week 3, Sept 21 | **week 4, Sept 28** |
| LGL151 week 2 LSO competencies | 171, 172, 170, 167 | 171, 172, 170 |
| LGL151 week 3 LSO competencies | *(none)* | 167 |

**Cause.** Both items are the FIRST line of their cell. `pdftotext` flattens a
table to text, so the first line of a cell lands directly under the last line of
the row above and reads as though it belongs there. LGL151 also centres its
cells vertically, which made the misreading look plausible.

**Fix.** `extract.py` no longer reads flattened text. It reads each table by its
real cell geometry into `build/<CODE>.rows.json`, and `validate.py` now checks
every value against the row **with the matching date** rather than against the
document as a whole. Re-introducing the original error now fails the validator.

All eight syllabi were re-checked against their cell boundaries. LGL152, LGL153,
LGL154, LGL156, LGL160, LGL225 and LGL250 were correct as recorded; LGL151 was
the only course affected.
