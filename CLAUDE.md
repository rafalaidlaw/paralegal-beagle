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

## The source documents stay OFF the repo

**No syllabus, handout, certificate or piece of Rafael's coursework goes into
git.** They live in `syllabi/`, `handouts/` and `reference/` on his machine and
are listed in `.gitignore`; they were in the repo until 28 Sep 2026 and were
removed from its whole history that day, at his instruction — "the actual pdf
documents we got the syllabus information from, those documents should stay
offline", and "we don't want anything online that isn't related directly to the
schedule we've built".

The reasoning is the project's own: **the PDFs were the input to a process that
has already run.** `data/*.csv` is the source of truth and the syllabi are how
it was typed up once. One of them was pulled from behind his student login, one
is an open-badge certificate with his name on it, and his coursework answers are
his to hand in — none of that is a fact about when something is due.

What this costs, and it is worth knowing before someone is surprised by it:

- **`extract.py` cannot run from a fresh clone.** It needs the PDFs, which only
  exist on Rafael's machine. That is fine — extraction is a once-per-syllabus
  job, not part of running the app.
- **`build/*.rows.json` STAYS**, and must. `validate.py` rule 8 reads it to match
  every schedule row against its own row in the source table — the check that
  catches an item filed on the wrong week. It is processed data, not a document.
  The `build/*.txt` flattened dumps went with the PDFs: nothing reads them, and
  this file already says never to go back to flattened text.
- **`reference/claude-design*/` stays.** That is the app's own design export, not
  a course document.

The test for anything new: **is it a fact about when something is due, or a
derived file the app or its checks read?** If not, it does not go in.

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

**This only runs on Rafael's machine.** `syllabi/` is not in the repo (see above),
so a clone has `build/*.rows.json` but not the PDFs they came from. Nothing about
running or checking the app needs them; re-extraction does.

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
below. The app OPENS on `SHOWN[0]`, which is the Weekly Calendar (26 Sep 2026; it
opened on Upcoming until then, and the landing screen used to be set in a
second place and drifted). Move a name to the front of `SHOWN` and the app
opens there. A deep link to a hidden screen lands there too.

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

**`color-scheme: light dark` is declared ONCE, on `:root`, and is never
narrowed to a single value.** It is not a colour, and it is not a description
of what is showing — it is a declaration of what the page SUPPORTS, and
browsers act on it. Saying `light` while showing the light theme reads as "this
page has no dark mode", and Chrome on Android then force-darkens it for you:
that was Rafael on 26 Sep 2026, "it doesn't set the entire site to light, just
some elements". The cost of declaring both is that a native select or scrollbar
follows the device rather than the chosen theme, which is worth it and barely
visible — the three published screens carry no native controls. The address bar
is the one surface even this cannot reach, so `index.html` carries a
`theme-color` meta, set before first paint and again in `paintChrome()` from
the body's own computed background. `interact.mjs` checks the declaration in
both themes, at phone size.

## The phone is a different drawing, not a narrower one

Rafael designed the mobile version in Claude Design and it was built on
27 Sep 2026. The export and a full account of what was taken live in
`reference/claude-design-mobile/README.md`; the rules that matter here:

**Under 900px the app is a fixed-height shell.** `100dvh`, one header that
never moves, and exactly one scroller (`#main`) beneath it. `100dvh` and not
`100vh`, because a phone browser's toolbars collapse as you scroll and `100vh`
is the tall figure, which hides the last row under the fold. The page title bar
is hidden there — the tab bar already names the screen, and it carries
`aria-current="page"` so that is said out loud and not only in colour.

**Two screens are drawn differently, and only two.** `PHONE()` reads
`matchMedia` at render time, never cached, and a width change re-renders —
rotating a phone mid-week is a real thing.

- `gridPhone()` — the Weekly Calendar as **one week, as a list**. The desktop
  grid is not made narrower; it is not drawn at all. Eight columns across 412px
  is the wrong artefact, not a layout problem. What survives is what a grid cell
  holds: course, day, anything graded, topic, and `chapterChip()` keyed exactly
  as everywhere else, so one tick is still one row in `progress.csv`. Above it,
  a strip of one cell per week, **all the same colour**. It used to be tinted by
  the share of his grade falling in each week, and that went on 28 Sep 2026 at
  Rafael's request: fifteen shades of red across fifteen cells made every week
  read as a warning, which is the same mistake as drawing 27 unstated scopes in
  `--hot`. The strip's job is getting to a week, not ranking them. Red is left
  saying exactly two things there, both about WHERE you are rather than how bad
  it is — `.now` underlines the current week, `.on` boxes the week on screen —
  and the aria-label dropped its "N% of your grade" with the tint, because a
  screen reader should not describe an encoding that is no longer drawn. The
  load figures are not lost: they are the Crunch screen's whole subject, and
  This Week's runway still reads `crunchWeeks()`, which still supplies the week
  list and `isBreak` here. `interact.mjs` asserts no cell carries an inline
  style and that every non-study week paints the same background, so the tint
  cannot return as either an inline background or a rule.
  **The list runs down in `WEEK_ORDER`, the same order the desktop's columns run
  across** (Rafael, 28 Sep 2026) — LGL156, LGL151, LGL250, LGL225, LGL154,
  LGL160, LGL152, LGL153. It was sorted by class date, which looked reasonable
  and made the two screens disagree about the same week. It is **not**
  chronological and must not be re-sorted to be: every row prints its own date,
  and a phone that reads like the desktop is worth more than a phone sorted by
  the clock. `interact.mjs` asserts the ranks never decrease, so reordering
  `WEEK_ORDER` does not fail a test that is about agreement rather than about
  any particular order. The two meetings of LGL152, LGL156 and LGL250 stay in
  date order within their course, as one grid column holds both.
- `timetablePhone()` — the Timetable as day-by-day lists. The chart is drawn to
  scale and that IS the chart; squeezed to 412px the proportions stop being
  legible and what is left is a list pretending to be one. So it is a list,
  honestly — and it can say the one thing the chart cannot: which class is next.

**Everything else is one render with CSS doing the work.** Upcoming, the chips,
the ticks, the data. Do not add a third phone branch without asking whether the
difference is really structural.

**The detail sheet is phone-only.** A row 412px wide cannot carry "open book:
textbook, references, forms, calculator" as well as a name, a date and a
weight, so it carries none of it and a tap brings the lot. It lives in `#sheet`
outside `.app`, because it covers a screen that scrolls. On desktop the cards
are wide enough and a modal over a mouse-driven page is a step backwards. It is
now the only place showing everything known about one graded item, Deadlines
being off — which is why an unstated scope is drawn there as a dashed chip:
the absence is the answer, and it is the answer he has to take to a professor.

**Archivo ships for the phone and for nothing else.** It sits AFTER the Windows
faces in `--sans`, so Bahnschrift still wins on desktop and every measurement
in `app.css` still holds — the three desktop screens are pixel-identical before
and after, in both themes, and that comparison is how any future change to this
should be checked. A phone has neither Bahnschrift nor Segoe UI Variable and
fell through to its own system font. One variable file covers 400–800.
`serve.py` names `/archivo.woff2` explicitly rather than opening a directory:
it stays a three-file server with one exception, not a static host, and
`build_static.py` lists it among the files it copies.

**The theme button has TWO states everywhere, not three.** `THEMES` is
`["light", "dark"]`. "Auto" went on 27 Sep 2026 at Rafael's request and for a
better reason than tidiness: it rendered identically to whatever the device was
already set to, so on a phone set to dark the step from dark to auto changed
nothing on screen — one tap in three looked like a broken button. It also meant
the page could carry no `data-theme` at all, and a page with no stated theme is
one Chrome on Android feels free to darken for you. There is now always an
explicit choice, `cycleTheme()` never deletes the attribute, and the answer to
"what is it showing" is always the attribute rather than storage.
`interact.mjs` asserts that every tap changes the rendered background.

**Nothing but `#main` scrolls on a phone.** `html, body` are locked and `#main`
carries `overscroll-behavior: contain`. Both are needed: the shell is 100dvh
inside a viewport the browser keeps re-measuring as its toolbars collapse, so a
few pixels of document scroll always existed, and at the foot of the list the
gesture was handed to them — scrolling back up then had to un-scroll the
document first, which reads as the screen ignoring your thumb. `contain` rather
than `none`, so the list still bounces at its own ends: that bounce is the
feedback saying there is nothing more.

**Never declare `-webkit-overflow-scrolling`.** It reads like the property that
makes a nested scroller feel native on iOS and it was in `#main` for that
reason. It is obsolete — iOS 13 and later give a nested scroller momentum with
no property at all — and its documented failure is exactly what Rafael reported
on 27 and again on 28 Sep 2026: reach the bottom of the list and the next
upward swipe is swallowed settling the momentum layer, so the first gesture
does nothing and the second works. It also breaks `position: sticky` in its own
descendants on iOS, which is what `.calbar` is. One line, two bugs, no benefit.
`interact.mjs` greps the stylesheet for the declaration, so **the comment that
forbids it names it without its colon** — the same trap `tools/contrast.py` hit
with `--name:`, and for the same reason.

There is also a 1px nudge off either end on `touchstart`, in `app.js`. It is
insurance and not the fix: iOS can leave a scroller resting exactly at an end
with the gesture still owned by its overscroll layer. Above 900px `#main` is not
a scroll container, so both branches clamp back to 0 and it costs nothing.

**`render()` puts back THREE scroll positions, and which one is live depends on
the width.** Above 900px the window scrolls; below it the window cannot — the
shell is fixed — and `#main` is the scroller. Restoring only `window.scrollY`
therefore did nothing on a phone, and every tick threw the list back to row
one: tapping a chapter chip forty rows down was a trip to the top until
28 Sep 2026. Restore all three — window, `#main`, and `.gridwrap`'s
`scrollLeft` — and let the ones that are not scrollable no-op.

**Stepping the phone calendar's week is the exception: it starts at the top.**
The arrows sit in the sticky bar, so without that a tap on `›` left you half
way down a week whose start you had never seen. A change of week is a change of
content, like a change of screen. The desktop grid draws all fifteen weeks at
once and has no stepper, so the reset is gated on `PHONE()` and can only ever
fire on a phone.

**The phone tab bar carries no counts and shortens one name.** A count earns
its place in the desktop sidebar, where it has a column to sit in; a tab bar is
for getting somewhere, and at a third of 412px the number competed with the name
for the space the name needed. `NAV_SHORT` narrows "Weekly Calendar" to
"Calendar" on a phone only — a narrowing, not a rename. `index.html` stays the
one place the full names are written, `LONG_NAV` reads them from it at startup,
and a rotated phone puts them back.

**The phone calls each course what Rafael calls it.** `SHORT_NAME` in
`app.js` — "Intro to the Legal System", "Legal Drafting" — used by the phone
calendar and the phone timetable. A 412px row spent two of its lines on
"Introduction to the Legal System for Paralegals", most of that on the word
"Paralegals", on a screen where every course is a paralegal course. It lives in
`app.js` and **not** in `data/courses.csv` for the same reason `WEEK_ORDER`
does: that file holds what the syllabus says, and a display name is a
preference. `name` stays the syllabus's own title and is what the desktop
shows. A course missing from the map falls back to its full name — LGL225's
title really is "Immigration Law", so its short name is the same string, and a
test that asserted "short differs from full" was wrong about that.

**`currentTheme()` reads the ATTRIBUTE first, then the stored value.** They
agree in ordinary use, but `?theme=` sets the attribute without storing
anything, so every screenshot the tools took of a dark page had a button on it
saying "Light". Fixed 27 Sep 2026; `interact.mjs` asserts the button names the
theme actually on screen.

**Four things in the design were deliberately not built** (Rafael, 27 Sep
2026): a "deadlines only" filter, the dashed "dated only to a week" band, a
fortnight horizon on Upcoming, and the Timetable's stats strip. Each is
something he removed from the desktop the day before, and the design predates
those decisions. Do not add them back from the canvas.

**Light is the default theme.** Rafael's Windows is in dark mode and he asked
for light regardless (13 Sep 2026), so with no stored choice `index.html`
stamps `data-theme="light"`. The toggle cycles light → dark → auto, where auto
follows Windows. `tools/shot.mjs` therefore requests the theme explicitly with
`?theme=`, and `tools/interact.mjs` asserts light-on-a-dark-system.

## Publishing it — `dist/`, and what must never go in it

`python build_static.py` writes `dist/`: `index.html`, `app.css`, `app.js`,
`data.json`, `robots.txt`, `_headers`. `netlify.toml` publishes that folder with
**no build command** — the files are generated here and committed, so Netlify
runs nothing and depends on nothing. In the Netlify form: base directory blank,
build command blank, publish directory `dist`.

**Re-run it after any change to `data/` or `app/`**, in the same breath as
`validate.py` and `export_schedule.py`. Nothing else notices if you forget; the
site just shows last week quietly.

**A Netlify URL is public to anyone who guesses it.** The repo is private and
holds his marks and his notes. (The syllabi, handouts and certificate were
taken out of the repo entirely on 28 Sep 2026 — see the top of this file — so
the danger is smaller than it was, but the rule below is what kept them off the
SITE even while they were in the repo, and it is still the rule.) So `build_static.py` **names the files it copies** rather than
copying a folder and excluding things. Never invert that. `grades`, `cases`,
`notes`, `syllabi` **and `progress`** ship as **empty arrays**, not as missing
keys — the sidebar counts read `.length` off each on first paint, so dropping
them killed the published page before its first render. `progress` joined them
on 26 Sep 2026: the site is meant to be usable by other people, and a stranger
opening it should neither find somebody else's reading already crossed off nor
be able to see what he has read. It is not in the file at all, not merely
hidden. The cost is that his phone and his laptop keep separate lists, which is
the honest trade for having no server. That is also why `dist/` is deleted
and rebuilt rather than written into: a file that stopped being published has
to stop being served.

Two things the published copy does differently, both in `load()`:

- **The date comes from the browser.** `build_payload()` stamps `today` at build
  time, and a frozen date on a screen whose whole job is counting down is worse
  than no date. `localToday()` uses local parts, never `toISOString()`, which is
  UTC and lands on the wrong day through a Toronto evening.
- **A tick has nowhere to go but the browser.** `STATIC` is true when
  `/api/data` did not answer; `setReading()` then writes `beagle-ticks` in
  `localStorage`, and `withLocalTicks()` lays those over the snapshot on every
  load. Kept separate on purpose: re-publishing with a newer `progress.csv`
  never wipes a tick made on the phone, and a phone tick never pretends to be
  in the CSV. Everything else that writes — notes, cases, marks — lives on a
  screen that is not published, and `post()` says so plainly if one is ever
  switched back on.

**`generated` is not published.** `build_payload()` stamps it to the second and
nothing reads it, so its only effect on `dist/` was to make `data.json` differ on
every build: `--check` could never say "same", which is the one question it
exists to answer before a deploy, and every rebuild carried a meaningless diff
into the commit. Same rule `export_schedule.py` already follows — provenance
names the commit and a digest of the CSVs, never a wall clock. `today` stays and
still changes daily, which is harmless: the published copy overwrites it with
the browser's own date in `load()`.

**Deploying is a `git push`, if the repo is connected to Netlify in the web UI.**
There is no build command, so Netlify copies `dist/` and runs nothing. The
Netlify CLI is installed but this folder is not linked and not logged in —
`netlify login` opens a browser and is Rafael's to run, not Claude's. Rebuild
`dist/` and commit it in the same breath; a push with a stale `dist/` deploys
last week quietly.

`node tools/statictest.mjs` checks all of this against `dist/`. It serves the
folder itself on its own port, so it never needs 8787 free.

`serve.py` serves exactly three static files — `/`, `/app.css`, `/app.js` —
with no asset route. So **no font file, image or SVG can be added without
changing the server**, which is why the type uses only faces installed on
Windows 11.

## `style_docx.py` — the app's look on a Word document

A utility, not part of the app. It puts the app's light theme onto any Word
document Rafael writes for a course, so his own work reads the way his tracker
does. **The documents themselves are not in this repo and must not be** — see
the top of this file. It is the tool that is version-controlled, never its
input or its output.

    python style_docx.py "<a document>.docx" --report     # classify, write nothing
    python style_docx.py "<a document>.docx"              # writes "<name> - styled.docx"
    python style_docx.py "<a document>.docx" --google     # Archivo, for Google Docs

Written for a document shaped as headings, short `Label:` lines and quoted
source text; `--report` prints how it classified every paragraph, which is the
thing to read before trusting the output on a new document.

Reads the palette out of `app/app.css`'s light `:root`, so the document cannot
drift from the app. **The input is never modified** — "Raw" stays raw, and
re-running after he edits it is always safe. What was learned doing it:

- **`extract.py` will not touch a new document.** That file maps course codes to
  exact filenames instead of globbing `syllabi/*`, for the reason its own comment
  gives, so dropping something into that folder is inert.
- **A paragraph with no text is not necessarily blank.** 22 of them are Google
  Docs horizontal rules — `<w:pict><v:rect o:hr="t">` — invisible to `.text`
  and very visible on the page. Styling a heading with a rule above it drew a
  second line beside each of those. `KEEP_SOURCE_RULES` picks one or the other;
  never both.
- **`Paragraph.runs` does not see a hyperlink's runs, but `Paragraph.text`
  does.** 33 paragraphs hold real hyperlinks (66 `w:hyperlink` elements), so
  rebuilding a paragraph from its `.text` and writing it back printed every URL
  twice. Nothing in the script rebuilds text: runs are restyled where they sit,
  which also keeps the links clickable.
- **Styling changes how text looks and never what it says.** An early version
  matched `":\s*"` on a label and reassembled the paragraph, silently deleting
  the colon from 92 of them. The check that catches this is comparing every
  paragraph's text against the source — it must come out identical.
- **`w:pPr`, `w:pBdr` and `w:rPr` are ordered sequences.** Appending to them
  gives a file Word opens but does not lay out as written. `insert_ordered()`
  puts each element where the schema wants it.
- **The accent is `--c-lgl225`, not `--accent`.** Red means stakes in this
  project and a reference toolkit has none; the course's own hue is how the app
  already tells Immigration Law apart. Red appears once, on "Important:", which
  is Rafael's own flag, and uses `--accent-text` — the red allowed on words.
- **Headings in Bahnschrift, body in Segoe UI**, both from the app's own
  `--sans` chain in that order. Bahnschrift is a condensed DIN, which is right
  for headings and chips and hard going for 26 pages of statutory prose.
  `BODY_FACE = HEAD_FACE` makes it all Bahnschrift.
- **It was checked by rendering it.** Word exports a PDF over PowerShell COM
  with no extra package (`New-Object -ComObject Word.Application`), and
  `pdfplumber` then reads back every rule position and every word's right edge
  — which is how the duplicate rules were found and how "nothing crosses the
  margin" is verified. Do not trust the docx XML alone; look at the page.
- **All three faces ship with Windows 11** and resolve in Word on his machine.
  In Google Docs, where the raw file was written, none of them do — hence
  `--google`, which writes a second copy in **Archivo** throughout with
  **Roboto Mono** for the URLs. Archivo is not a compromise there, it is the
  original: the app was designed in Archivo and only uses Bahnschrift because
  the app is offline (see `reference/claude-design/`). One face serves the whole
  document, as `--sans` does in the app, because Archivo is a normal-width
  grotesque rather than a condensed DIN. Two display properties do not survive
  a Docs import — `w:caps` and character tracking — so the labels lose their
  capitals and keep bold, grey and small, and `LABEL_PT` goes up slightly to
  carry it. **The text is not uppercased to fake it**; that would change what
  the document says.
- **The Google Docs copy cannot be verified from here.** The Word render is the
  real check on the Windows copy, but Archivo is not installed on this machine
  and Word substitutes, so that render says nothing about how Docs will lay the
  page out. Uploading Rafael's coursework to Google to find out is not this
  project's call to make. What IS checked: the file opens, the text is
  identical, the links survive, and no face is named that Docs does not have.

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
- **The header bands were aligned across the sidebar and back again**
  (26 Sep 2026). Two `min-height` tokens tried to make the sidebar's rules and
  the content's rules the same rules: `--bandh` locking `.brand` to `.mhead`,
  `--nowh` locking `.nowblock` to `.grow.head`. The column heads came with
  larger course titles at the same time. Rafael asked for it, looked at it, and
  preferred what was there before — the whole thing went back, and `app.css` is
  byte-identical to before it started.

  Worth knowing before anyone tries again. The two pairs are not independent:
  making the second pair line up means forcing a height on a row whose content
  wraps differently at every width, so the type size and the alignment are one
  decision. And doing only the first pair leaves the page-header rule aligned
  while the band below it is not — Rafael's word for that was "a tangent",
  which is the right one. **It is all or nothing, and he has seen all of it.**
- **~16px is the ceiling for a course title here, and the limit is sideways.**
  Eight columns across 1100px leaves about 117px of usable width, and a title
  is ordinary prose until one WORD is wider than that — "Administrative",
  "Communication". A word that cannot break does not wrap; it runs into the
  next course's column. 22px was tried and did exactly that, printing LGL160's
  "Communication" over LGL152's "Paralegals", with four- and five-line titles
  and the band at 181px. 17px already spills LGL160. `interact.mjs` keeps the
  check even though the row is back at 12.5px, because the ceiling is a fact
  about the column width, not about the size currently set. **Going bigger
  needs wider columns**, which means the grid stops fitting beside the sidebar
  at 1440 and starts scrolling sideways — and seeing all eight courses at once
  is what the screen is for. Short display names would buy it; the full titles
  will not.
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
- **A closure only earns a band if it shuts a class.** Both of this term's
  fall on a Monday — Labour Day and Thanksgiving — and Rafael has no Monday
  class, so they were two rows of the calendar saying nothing (his call,
  26 Sep 2026). The test is derived from `data/timetable.csv`, not hardcoded to
  "not Monday", so a band returns by itself if a Monday class ever appears; and
  if that file is ever empty, every closure shows, because silence is the wrong
  default here. The drop-deadline and grades-released bands are unaffected.
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
