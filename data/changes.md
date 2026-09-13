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

## 2026-09-12 — second sweep, all eight syllabi

Three independent passes: (1) a recall check that everything printed in each
syllabus row is in the data — the reverse of what `validate.py` had been
checking; (2) raw-date ↔ ISO-date agreement; (3) a visual audit of the rendered
PDF pages, one reviewer per course, with every reported discrepancy re-checked
by a second reviewer told to refute it. Authority throughout: `syllabus`.

**No date, weight, chapter, page range, deadline or exam scope was wrong in any
course.** What was found:

| Course | Was | Now |
|---|---|---|
| LGL151 wk 6 (Oct 12) | `chapters` empty | `4` — a parser regression had blanked it; the reading is Chapter 4 |
| LGL225 | textbook not recorded | *Canadian Immigration and Refugee Law for Legal Professionals*, 5th ed., Lynn Fournier Ruggles (no ISBN printed) |
| LGL152 | Fri `8:00am-9:45am` | `8am-9:45am`, as printed |
| LGL160 wk 4 outlines | wording truncated; type `assignment` | full wording incl. "See and follow instructions"; type `milestone`, matching assessments.csv |
| LGL225 tool kit | raw string implied a printed date | now says the kit has no printed date and is due because the Sept 30 quiz requires it |
| LGL154 wk 12 | "Excel continued" | "Excel Continue", as printed |
| LGL151 wk 13 | "Andrews v Law Society of BC" | kept — the syllabus prints "Andrew", a typo for *Andrews v Law Society of British Columbia*, [1989] 1 SCR 143; noted on the row |
| LGL152 wk 7 | "Hadley v Baxendale" | "Baxendale [Hadley v Baxendale]" — the syllabus prints only the second name; the expansion is now visibly bracketed |
| LGL160 wk 14 | LSO `46-53` | kept; the syllabus prints "46053", a typo; noted on the row |

`validate.py` gained rules 11 (every chapter the syllabus row names must be
recorded) and 12 (date_raw and class_date must be the same calendar day). Both
were checked by breaking the data on purpose and watching them fail.

Two "mismatches" the sweep reported were the PDF's `ﬁ` ligature in
"Yousseﬁ" / "ﬁlici" — the data's ordinary spelling is correct.

## 2026-09-13 — LGL160 Oral Presentation: Rafael's slot

| field | old | new |
|---|---|---|
| due_date | *(blank; week of 2026-10-07, precision `week`)* | 2026-11-25 (Wed, week 12), precision `exact` |
| source_file | LGL160 | announced |
| note | "You must be ready to present in ANY class from this week onward…" | slot and topic: **Peacebuilders International (Toronto)**, Wed 25 Nov |

**Authority:** reported by Rafael on 13 Sep 2026. He did not say whether it came
from class, Blackboard or email — worth noting here when known.

The syllabus itself only says presentations begin the week of 10/7 and continue
through the term, and `schedule.csv` keeps that wording on the week-5 row. The
assessment now carries his actual slot, which is what the deadline views and the
crunch load should reflect. `source_file: announced` tells `validate.py` not to
look for this date in the syllabus.
