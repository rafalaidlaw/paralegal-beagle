# Paralegal Beagle — working notes for Claude

Rafael's semester tracker. Seneca Polytechnic, **Paralegal Accelerated diploma
(PLEA)**, semester 1, **Fall 2026**. He is a paralegal student, not a software
engineer — prefer plain files and short scripts over frameworks, and explain
changes in terms of his coursework, not the code.

## The one rule that matters

**`data/*.csv` is the source of truth. Everything else is derived and disposable.**

`data/schedule.csv`, `courses.csv` and `assessments.csv` were extracted from the
syllabi once and are now edited **by hand**. `timetable.csv` came from a picture
of Rafael's own timetable, not a syllabus, and says so per row. `progress.csv`, `grades.csv` and
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

## The paralegal wiki, and what this project owes it

Rafael keeps a second project at `../paralegal-wiki`: an "LLM wiki" in Andrej
Karpathy's pattern, where Claude Code maintains Markdown pages of doctrine,
cases and statutes under its own `CLAUDE.md` schema, and Obsidian is only the
viewer. **The division of authority is the thing to protect:**

| | this project | the wiki |
|---|---|---|
| owns | dates, weeks, chapters assigned, deadlines, weights, LSO numbers, stated exam scope | doctrine, tests, elements, cases, statutes, analyses, quizzes |

Ask "could a professor change this by announcement?" If yes it is calendar, and
it is ours. Neither project stores the other's facts, and nothing here should
ever be written into `wiki/` — those pages have one maintainer.

`python export_schedule.py` writes one generated file per course into
`../paralegal-wiki/context/`, so the wiki's Ingest workflow can look up a real
class date instead of guessing one. It had to: the wiki's first source page
recorded the ingest date because the lecture PDF gave none. Notes:

- It **reads the wiki's own class list** from that repo's `CLAUDE.md` §3 rather
  than holding a copy. LGL154 is excluded there on purpose; follow it, and stop
  rather than invent a class folder.
- It imports `serve.py` and calls `build_payload()`, so readings, week numbers
  and deadlines are derived exactly once, in one place. A second derivation is
  a second answer waiting to disagree.
- Output is deterministic — the provenance line names the commit and a digest of
  the three source CSVs, never a wall clock, so an unchanged export leaves the
  wiki repo's `git status` clean. `--check` says what would change and writes
  nothing.
- Re-run it after any change to `data/`, right after `validate.py`.

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

**Three screens, in this sidebar order: Weekly Calendar, Upcoming, Timetable**
(`SHOWN` in `app.js` is that order; Deadlines was switched off on 26 Sep 2026,
its view code intact). `#deadlines` and `#exams` therefore land on Upcoming.
**Nothing may link to a screen that is not shown** — the fortnight rows on
Upcoming become plain `div`s and point at the Weekly Calendar instead, exactly
as `pill()` and `legend()` do for Courses; `interact.mjs` asserts it. Rafael cut the app to three on
24 Sep 2026, added the Timetable on 25 Sep, and on 26 Sep renamed This Week to
**Upcoming**, moved the Weekly Calendar to the top, and asked for the roll
below. The app still OPENS on Upcoming — sidebar order and landing screen are
separate things.

**Upcoming's horizon is the week it names — the five business days of it.**
Not a rolling 7 or 14 days from today (Rafael, 26 Sep 2026). A rolling window
slides against the thing he plans around: on a Friday it reached halfway into
the week after, and on a Monday it stopped short of the Friday he was preparing
for. Items are selected by `week_no`, which is also what the Weekly Calendar
places by — so the two screens agree **by construction**. Keep that true: it is
what let him catch the week-window bug by comparing them.

**Every item of that week gets a card** — not the nearest three with the rest
in a list beneath (26 Sep 2026). The list made the fourth item read as an
afterthought, and in week 4 the fourth item is a 30% test. Rafael had already
caught an earlier version hiding that same test behind the words "seven more
inside the fortnight": **a count is a hiding place**, and so is a smaller row.
`.cards` is an auto-fit grid, four across at 1440, wrapping below. A week with
nothing graded shows one `.card.quiet-week` naming the next item beyond rather
than going blank. Every card names its course in full as well as by code.

Two advisory bands went at the same time. The `.upnext` list had nothing left to
list. The dashed **"The syllabus gives a week, not a day"** band told him to
confirm the day in class and correct the CSV — and once he does, which is how
LGL152's midterm got its Friday, it has only that same sentence left to repeat.
The fact is not lost: a week-precision card still reads "week of Mon 28 Sept"
instead of a day. `.upnext`, `.uprow`, `.weekband` and `.wbrow` all stay in
`app.css`.

**Upcoming rolls forward at the weekend.** Classes run Mon–Fri, so from
Saturday the week you are standing in has nothing left to prepare for:
`nowWeek()` adds one when `rolledForward()` (Sat or Sun). The roll is global on
purpose — sidebar, the Calendar's ruled row, the runway marker and the reading
backlog all move together, because one screen calling week 3 current while
another calls week 4 current is worse than either. The sidebar says which it is
doing: "Current week" or "Week ahead", with "Starts Mon 28 Sept" instead of a
date range. **Never roll one of these and not the others.**

A consequence worth keeping: a week-precision item whose Monday has passed must
never be labelled "this week" once the roll has happened — that names the wrong
week. `countdown()` counts to `dMax` instead ("1 day left"), which is the only
honest number left on it.
The Term Grid was renamed on 24 Sep 2026; its route stays `#grid` so old
bookmarks keep working, with `#calendar` as an alias. The sidebar's "Now" /
"The term" group headings went at the same time — three entries need no
grouping, though `.nav .grp` stays in the stylesheet for whatever comes back.
Rafael
cut it to what he opens. Crunch, Courses, Notes, Cases and Review are still
built, still rendered by `viewtest.mjs`, and still correct — they are listed in
neither the sidebar nor the router. The switch is `SHOWN` in `app.js`; add a
name there and un-comment its `<a>` in `index.html` to bring one back, and
nothing else. **Do not delete those views' code**: This Week's runway calls
`crunchWeeks()` from the Crunch section and the header calls `reviewItems()`,
so cutting the blocks out breaks the screens he kept. Two consequences worth
saying out loud rather than rediscovering: with Courses away there is nowhere
to enter a mark, so grade standing is dark; and anything that would link to a
hidden screen must not render as a link — `pill()` and `legend()` fall back to
plain chips, and `tools/interact.mjs` asserts it.

Routes are hash-based and bookmarkable: `#deadlines`, `#week/7`. `#exams` is
kept as an alias of `#deadlines`, and a deep link to a hidden screen
(`#courses/LGL225`) lands on This Week rather than a blank page. The sidebar footer has a theme toggle; the choice lives
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
- **The Timetable is drawn from `data/timetable.csv`, which is not derived
  from the syllabi.** It is Rafael's Seneca enrolment listing (25 Sep 2026),
  the one file in `data/` with a `source` column, and every row is
  `confidence: high`. An earlier version held times read off a screenshot; the
  listing corrected six of them by up to an hour. **Never re-introduce a time
  read off a picture when the listing has one.**
- **The Timetable is the chart and nothing else** (26 Sep 2026). In three
  passes it lost the table beneath it, the standing callout about the section
  conflict, then the stats strip above it (classes a week, heaviest day, clear
  days, hours in class) and the subtitle. Each was countable off the chart in a
  second, and together they pushed the chart itself under the fold. The
  low-confidence warning survives in `VIEW_META` — it fires only when a row is
  unsure, which none is, so the subtitle reads empty. If a figure earns its
  place back, it belongs beside the thing it counts, not in a band above it.
  The table repeated what the chart said, and the callout That conflict is not
  lost: it is in `data/changes.md`, in this file, in `README.md`, and in the
  `note` column of every affected row of `data/timetable.csv`.
- **The listing gives starts and rooms but no end times.** Five blocks take
  their end from a syllabus; six have none stated anywhere and carry a blank
  `end`. Those draw `OPEN_DRAW_MIN` (45) minutes tall with a dashed foot and
  read "11:40am –". That 45 is a drawing decision so the chart has something to
  show — nothing is computed from it, and it must never harden into a claimed
  duration. Blocks are positioned by percentage of the day's span, so the chart
  holds its proportions at any width; a block under an hour tall drops to one
  line and shows the bare room code (`A4519`) or it clips its own text.
- **Three courses meet on a different day from the one their syllabus
  describes, and nothing has been re-dated.** Enrolled: LGL151 **Tue 1:30pm**
  A-A4526 (every LGL151 row in `schedule.csv` is a **Monday**); LGL152 **Thu
  11:40am online** + **Fri 9:50am** A-A3518 (syllabus NPE: Thu 2:25pm, Fri
  8:00am A-A4513); LGL156 **Tue 11:40am** A-A4519 + **Thu 1:30pm online**
  (syllabus NPE: Wed 5:10pm C-C3036, Thu 9:50am). This bears on deadlines, not
  only the drawing — LGL152 and LGL156 date work to "during in person class",
  so their in-person day is the due day and it has moved. **Do not re-date
  `schedule.csv` to match.** The prior question is whether the syllabi on file
  are for his own sections: a syllabus for another section is wrong throughout,
  not merely on its weekday. The listing does settle open question 3 — LGL156
  and LGL250 do not clash on Thursday. See `data/changes.md`, 25 Sep 2026.
- **The Weekly Calendar's columns run in Rafael's week order**, not
  alphabetically: LGL156, LGL151, LGL250, LGL225, LGL154, LGL160, LGL152,
  LGL153 (`WEEK_ORDER` in `app.js`, also used by `legend()`). It is his order,
  not the clock's — by meeting time Administrative Law is sixth (Wed 5:10pm)
  and he asked for it first on 24 Sep 2026. Do not "correct" it, and do not
  move it into `data/courses.csv`: that file stays alphabetical, and column
  order is a preference, not a fact from a syllabus. A course missing from
  `WEEK_ORDER` still renders, at the end.
- **The Weekly Calendar is 1100px wide minimum**, which fits beside the 238px
  sidebar at 1440. The reference used 1260 and cut off the eighth column.
  Chips inside grid cells wrap; everywhere else they do not.
- **A phone layout is checked with `tools/probe.mjs`, not a screenshot.**
  Chrome's `--window-size` does not reliably set the CSS viewport in headless
  mode. `tools/shot.mjs` sets it over the DevTools protocol and is trustworthy.
  The sidebar folds into a top band under 900px; the reference itself
  overflowed at 412 because it never did this.
- **12px is the floor for anything with content.** The reference used 10.5px
  and 11px labels; the app holds 12.
- **The sidebar footer counts down the term.** `classesLeft()` counts schedule
  rows that are not study-week markers and fall today or later; beneath it a
  line from `PEP` changes with the date. It is indexed by days since week 1,
  never random — a line that changed on every re-render would be noise. Keep
  them short and level: no congratulating him for existing, no triple
  exclamation marks. The list is just strings and any length works.
- **"Assignment # 1" is repaired on the way to the screen, not in the CSV.**
  LGL154's syllabus really prints the space, and `data/*.csv` keeps it because
  every figure has to trace back to a page of the PDF. `tidyHash()` closes the
  gap and `nm()` is `esc()` plus that repair; apply `nm()` to names, due items
  and topics. **Not** to the Review tab's "source text" blocks — those are
  shown as verbatim proof of what the syllabus says.
- **Never name a component class after an assessment type.** `.exam` on a card
  collided with `.tag.exam` on a chip once and doubled every exam chip's
  height.
- **Native `<select>` is as wide as its widest option.** The note picker holds
  121 class meetings; it needs `max-width: 100%`.
- **One chip, every view.** A chapter's tick box is `chapterChip()` on This
  Week, Courses and the Weekly Calendar alike, keyed by the reading id, so one
  click anywhere is one row in `progress.csv` and every view agrees. The
  grid restyles the chip (`.gcell .chch`); it does not have its own. A
  re-render also puts back the grid's sideways scroll, not only `scrollY`.
- **A grid cell reads graded items first**, then the chapter chips, then the
  LSO line, then any "check" flag. Rafael asked for the assessments on top
  (17 Sep 2026): they are what matters most in a week.
- **A calendar column is headed by its course NAME, with the code beneath**
  (26 Sep 2026). The two swapped weight as well as order: the name takes
  `--ink` at 700, the code drops to `--ink3` at 500. The code stays on the page
  because every chip, note and validator message elsewhere is keyed to it — it
  simply stopped being the headline. Held at 12.5px deliberately: LGL151's
  title already wraps to four lines, and the header row is sticky, so a size
  bump there costs height on every screen of the term.
- **The Weekly Calendar is monochrome, and carries no key** (26 Sep 2026).
  The 3px coloured rule over each column and the `legend()` at its foot both
  went: eight hues across eight columns is a code whose only message was the
  course code printed underneath it. `legend()` and the `--c-lgl*` tokens are
  untouched — the **Timetable** still uses them, and there the colour earns its
  place, because it is what tells two classes in the same hour apart. The column
  heading also stopped being an `<a>` to the hidden Courses screen; it was
  styled to look like text, so clicking it dropped you on Upcoming with no
  explanation.
- **Upcoming does not list what has already happened** (26 Sep 2026). The
  overdue callout was the one thing on a "what is next" screen that could not
  be acted on. The items are not hidden: the Weekly Calendar still carries them
  and a passed deadline still greys itself. `isOverdue()`, `dMax()` and the
  greying rule are all unchanged.
- **A ticked chapter greys out; it does not go black** (26 Sep 2026). The
  done state used to fill its box with `--ink` and outline the whole chip in it,
  which made finished reading the heaviest mark on the Weekly Calendar. It now
  fills with `--ink4` over a `--line` border. The box stays filled — fill
  against empty is what distinguishes done from not-started, and `interact.mjs`
  asserts both that and that the fill is lighter than the body ink. `--ink4` is
  allowed here because a 12px square is decorative; the label stays `--ink3`.
  In-progress deliberately keeps full `--ink` and is now the darkest of the
  three states: it is the chapter actually open.
- **The Weekly Calendar's "show deadlines only" button is gone**
  (26 Sep 2026). It hid the chapter runs, and those are the reason Rafael opens
  that screen. `DL_ONLY = false` in `app.js` is tested BEFORE `localStorage`,
  so a switch left on before the change cannot go on hiding the readings —
  `interact.mjs` asserts exactly that. `.grid.deadlines-only` stays in the
  stylesheet and `toggleDeadlinesOnly()` stays in the code, so the restore is
  one flag plus the `.gtools` block described in the comment where the button
  used to be.
- **LSO competencies are switched off** (`SHOW_LSO = false`, 26 Sep 2026).
  They put a line on every class and there was nothing to act on: no syllabus
  gives the wording behind a number, and the app must not invent it. The data
  is untouched — `lso_nums` is still on 65 schedule rows and still exported to
  the wiki's `context/` files — so flipping `SHOW_LSO` brings every line back
  on all three screens. Do not delete `lsoLine()` or the column.

## `date_precision: unknown` — an item whose date is not his to know

LGL151's case presentation is worth 15%, and the syllabus dates it to the week
of 28 Sept — but that is when presentations BEGIN. They run for weeks and each
student's slot is posted to Blackboard. Counting down to the start of the run
named a day nobody had given him (Rafael, 26 Sep 2026).

So `date_precision` has a third value. `resolve_due()` returns `""` for it,
which drops the item off both screens: Upcoming filters on `due_resolved`, and
the Calendar places by a `week_no` derived from it. What does NOT change:

- `due_week_of` keeps the printed date, so `validate.py` rule 8 still matches
  the real class row and proves it carries its 15%;
- the weight still counts toward the course's 100;
- `validate.py` **names every unknown-precision item on every run**. A graded
  item that quietly stopped appearing looks exactly like a course with nothing
  due, which is the failure this project exists to prevent. Never make this
  silent.

`whenLabel()` and `relLabel()` both have to answer for an undated item — they
read "date not set" and "still to be announced". Before that guard the Courses
screen rendered "week of " and "in NaN days", which reads as a fetch that
failed rather than a date nobody has given yet.

The class row itself is untouched: `schedule.csv` still carries
"PRESENTATIONS BEGIN (15%)" on Mon 28 Sept with its note that his own slot is
on Blackboard, and that still shows in Upcoming's readings list. That is a fact
about the class meeting, not a deadline aimed at him, and it has its caveat
printed beside it.

## A week-precision deadline has TWO horizons

Sixteen of the thirty-five assessments give a week, not a day. `due_resolved`
holds that week's Monday, and code must pick the right end of the window:

`due_resolved` is the **Monday** of the named week, and `resolve_due()` in
`serve.py` makes sure of it. It has to: eleven rows do not hold a Monday in
`due_week_of`, they hold their own course's class day, because that is what the
syllabus prints — LGL152's three Thursdays, LGL156's four Wednesdays, LGL160's
four Wednesdays. Until 26 Sep 2026 that value was used verbatim, and since
`lastPossible()` adds six days, those windows ran up to four days into the NEXT
week: LGL160's quiz, sat on Wed 23 Sept, still read "3 days left" on Sat
26 Sept. **Never normalise `due_week_of` in the CSV to fix this** — `validate.py`
matches that printed date against the course's real class row, and that is the
check that catches an item filed on the wrong week. Normalise in the
derivation, where it belongs. Week numbers are unaffected either way, which is
why the Weekly Calendar was right throughout and comparing the two screens is
what found it.

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
5. ~~**LGL152 Midterm #1 and LGL153 Test 1 both land Fri 2 Oct.**~~ Settled
   by Rafael, 26 Sep 2026: his LGL152 class is the Friday, before LGL153. Both
   stand, same day — the midterm at 09:50, the test at 13:30. LGL152-A01 is
   dated exactly now; see `data/changes.md`.
6. **Textbooks unnamed** for LGL151, LGL152, LGL153. LGL152 almost certainly uses
   **two** books — contracts ch. 9–17 and torts ch. 1–8, numbering restarts.

When Rafael reports an answer, update `data/` **and** append to
`data/changes.md` with the authority (`syllabus` / `announced in class` / `LMS` /
`email` / `assumption`) and the old value.
