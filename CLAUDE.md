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

`validate.py` checks the DATA. For anything about the interface, see
`tools/README.md` — it lists the six checks and the order to run them in.

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

Standard library only. Binds 127.0.0.1. There is **no build step** — edit
`app/*` and refresh. Rafael has asked "did you build it?" before; the answer is
that a refresh is the build.

Views, in the sidebar: This Week, Deadlines, Term Grid, Crunch, Courses, Notes,
Cases, Review. Routes are hash-based and bookmarkable: `#deadlines`,
`#courses/LGL225`, `#week/7`. `#exams` is kept as an alias of `#deadlines` so
old bookmarks land. The sidebar footer has a theme toggle; the choice lives
in `localStorage` and is read before the first paint by an inline script in
`index.html`. There was also a Roomy/Compact spacing toggle; Rafael chose
compact for good on 13 Sep 2026, so `--rowpad`/`--secpad` are 8/18 and the
button is gone. Do not bring it back.

**Light is the default theme.** Rafael's Windows is in dark mode and he asked
for light regardless (13 Sep 2026), so with no stored choice `index.html`
stamps `data-theme="light"`. The toggle cycles light → dark → auto, where auto
follows Windows. `tools/shot.mjs` therefore requests the theme explicitly with
`?theme=`, and `tools/interact.mjs` asserts light-on-a-dark-system.

`serve.py` serves exactly three static files — `/`, `/app.css`, `/app.js` —
with no asset route. So **no font file, image or SVG can be added without
changing the server**, which is why the type uses only faces installed on
Windows 11.

## The interface — where the look came from, and what was measured

On 13 Sep 2026 Rafael designed the app in **Claude Design** and chose to adopt
the whole look. The export is preserved in `reference/claude-design/` with a
README of what was taken and what had to change. The look is the Modernist
system: flat, ruled, square corners, a sidebar with counts, one red accent,
grotesque headings. Do not soften it back toward panels and rounded corners;
that was the previous design and he asked for this one.

These facts were verified in a real browser. Several contradict what looks
reasonable in a stylesheet; re-measure before undoing any of them.

- **Bahnschrift stands in for Archivo** (Archivo is a Google Font; the app is
  offline). Bahnschrift resolves and its **weight axis works**, verified by
  ink coverage — a width test misleads because its advance widths stay
  constant across weights, a DIN trait that is handy in tables. **Never name
  `"Bahnschrift SemiBold"` as a family**: that locks the weight. Bare
  `"Segoe UI Variable"` does NOT resolve; its Text/Small/Display variants do.
  Check any new family with `tools/measure.mjs`.
- **The red is two tokens.** `--accent` is the bright red and is a MARK only:
  rails, bars, fills, numbers of 22px and up (3:1 is the floor there). In
  light mode it measures 3.8:1 on the page, so it must never carry body
  text. `--accent-text` is the deep red for words. `tools/contrast.py` checks
  each against its own floor.
- **Red means stakes**: an exam or test, the very next graded item, a heavy
  week, the current week, the active view. Quizzes, assignments and
  presentations are ink. A course is told apart by its own hue as a 3px rail
  or a dot beside its mono code — never by red.
- **`tools/contrast.py` strips comments before parsing.** A note like
  "3.8 on --bg: marks only" read as a declaration and silently swallowed the
  `--accent-text` line after it. That is why the comment beside a token must
  never contain `--name:`.
- **The Term Grid is 1100px wide minimum**, which fits beside the 238px
  sidebar at 1440. The reference used 1260 and cut off the eighth column.
  Chips inside grid cells wrap; everywhere else they do not.
- **A phone layout is checked with `tools/probe.mjs`, not a screenshot.**
  Chrome's `--window-size` does not reliably set the CSS viewport in headless
  mode. `tools/shot.mjs` sets it over the DevTools protocol and is trustworthy.
  The sidebar folds into a top band under 900px; the reference itself
  overflowed at 412 because it never did this.
- **12px is the floor for anything with content.** The reference used 10.5px
  and 11px labels; the app holds 12.
- **Never name a component class after an assessment type.** `.exam` on a card
  collided with `.tag.exam` on a chip once and doubled every exam chip's
  height.
- **Native `<select>` is as wide as its widest option.** The note picker holds
  121 class meetings; it needs `max-width: 100%`.
- **One chip, every view.** A chapter's tick box is `chapterChip()` on This
  Week, Courses and the Term Grid alike, keyed by the reading id, so one
  click anywhere is one row in `progress.csv` and every view agrees. The
  grid restyles the chip (`.gcell .chch`); it does not have its own. A
  re-render also puts back the grid's sideways scroll, not only `scrollY`.
- **A grid cell reads graded items first**, then the chapter chips, then the
  LSO line, then any "check" flag. Rafael asked for the assessments on top
  (17 Sep 2026): they are what matters most in a week.
- **LSO competencies are numbers only.** The syllabi print "LSO
  Competencies: 202, 204" per class meeting (`lso_nums`, shown by
  `lsoLine()` in the syllabus's own order). No syllabus gives the wording
  behind a number, so the app never does either — that would be invented.

## A week-precision deadline has TWO horizons

Sixteen of the thirty-five assessments give a week, not a day. `due_resolved`
holds that week's Monday, and code must pick the right end of the window:

- **Planning uses the earliest day** (`dMin`, the Monday). The quiz in the week
  of Mon 21 Sep reads "in 9 days".
- **Lateness uses the last day** (`dMax`, the Sunday). Nothing is called overdue
  while its week is still running.

Getting this backwards is not cosmetic: measuring urgency to the Sunday made
that quiz read "15 days" and pushed two items out of the fortnight rail
entirely. Neither horizon ever invents a weekday — the label still reads
"week of Mon 21 Sep", and the dashed week band on This Week says so in words.

## Facts about the data worth knowing before designing for it

Checked on 12 Sep 2026; re-check rather than assume if the CSVs have moved on.

| | |
|---|---|
| Weights per course | all eight sum to **exactly 100.0** |
| Assessments with unstated scope | **27 of 35** (11 of them exams/tests) |
| Week-precision assessments | **16 of 35** |
| Low-confidence rows | 1 schedule row, 1 assessment, **none `low`** |
| Courses with no textbook named | **four** — LGL151, LGL152, LGL153, LGL154 |
| Courses with no instructor named | one — LGL153 |
| Most chapters in one class meeting | 4 (LGL151 week 5) |
| Readings in week 15 | **none** — its chapter numbers are the final exam's scope, which `derive_readings` excludes on purpose |
| Class meetings listing LSO competencies | **65 of 121** — six courses; LGL154 and LGL225 list none |

Two consequences for the UI. The weight-sum warning is **dormant defence**: it
is correct and cheap, but it will not fire, so never put a figure like "97%" in
copy or a mockup — it would read as a real defect in Rafael's data. And
unstated scope must be drawn as **absence** (a dashed neutral chip), not shouted
in red: 27 items in `--hot` made the missing information the loudest thing on
the page.

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
