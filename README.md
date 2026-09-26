# Paralegal Beagle 🐕

Your Fall 2026 semester, in one place. Eight courses, 121 class meetings, 35
graded items, pulled out of the syllabi and checked.

## Start it

Double-click **`start.bat`**, or from a terminal in this folder:

```
python serve.py
```

Your browser opens at <http://127.0.0.1:8787>. It runs only on this computer —
nothing is uploaded anywhere, and it works with the wifi off. Close the black
window to stop it.

There is nothing to build or install. If you change something in this folder,
just refresh the page.

## The screens

Three, listed down the left side with a count beside each.

| Screen | What it's for |
|---|---|
| **Weekly Calendar** | All fifteen weeks by all eight courses on one screen, with a tick box beside every chapter. Holidays, study week and the drop deadline get their own rows. A button hides the chapters when you only want deadlines. |
| **Upcoming** | What is next. One sentence at the top names the nearest graded item and how long is left on it, then the next three deadlines with a big day count each, your readings for the week class by class, and the whole term as fifteen bars down the right. **Once Friday is over it rolls to the following week** — on a Saturday it shows you the week you are about to walk into, not the one that just ended. The sidebar says "Week ahead" rather than "Current week" when it has done that. |
| **Deadlines** | Every graded item in date order, month by month: what it covers where the syllabus says, when it lands, what it is worth. |
| **Timetable** | Your ordinary week drawn to scale, from your class listing — which day, which hour, which room, which class number. Only the days you have a class are drawn, so there is no empty Monday column; the figures above the chart still tell you Monday is clear. |

### The five that are put away

Crunch, Courses, Notes, Cases and Review were switched off on 24 Sep 2026 to
keep the app to what you actually open. **They are not deleted** — the code is
untouched and still tested. To bring one back, add its name to the `SHOWN` list
near the top of `app/app.js` and un-comment its line in `app/index.html`.

Worth knowing while they are away: **Courses** was the only place to type in a
mark you got back, so grade standing is unavailable until it returns. **Review**
held the 24 open questions the syllabi left ambiguous — they are still listed in
`data/changes.md`.

## Getting around

- Click the box beside a chapter to cycle it: not started → in progress →
  done. The same box appears on This Week and the Weekly Calendar, and a
  tick made on any of them shows on all three. **All done** clears a whole
  class at once. Your progress lives in `data/progress.csv` and survives
  everything else.
- **LSO competencies** are the numbered items from the Law Society of
  Ontario's paralegal competency list that a syllabus attaches to each class.
  Six syllabi give them; they appear under the chapters wherever those are
  listed. Only the numbers are in the syllabi, so only the numbers are shown.
- On This Week, **‹ week** and **week ›** step through the term. The `[` and `]`
  keys do the same. **Back to this week** returns you to today.
- Click any bar in the term runway to jump to that week. Click a course code
  anywhere to open that course.
- The theme button at the bottom of the sidebar cycles **Light**, **Dark**,
  and **Auto**, which follows Windows. It starts on Light and remembers your
  choice.
- Every screen has its own web address, so you can bookmark one. `#deadlines`
  opens Deadlines; `#week/7` opens week 7; `#grid` and `#calendar` both open
  the Weekly Calendar; `#week` and `#upcoming` both open Upcoming.
- The bottom of the sidebar counts the class meetings you have left before
  the last day of term, with a short line underneath that changes each day.
- Upcoming lists **everything** inside the next fortnight: the three nearest as
  big cards, then the rest as rows with the course's full name, what it is
  worth and when it lands.
- The LSO competency numbers are switched off. They are still in the data, so
  they can come back — `SHOW_LSO` in `app/app.js`.
- A graded item drops off Upcoming once it can no longer be met — the day
  after, for a dated one; after its whole week has run out, for one the
  syllabus dates only to a week. Until then it counts down to the day its
  window shuts: "1 day left".
- On a phone the sidebar folds into a strip across the top.

The look was designed in Claude Design and rebuilt here to run offline. The
export it came from is in `reference/claude-design/`.

## Things worth knowing right now

- **LGL151 Quiz #1 (15%) is the week of Mon 21 Sep**, and the presentations
  start the week after. The syllabus states no scope; weeks 1–2 cover IRAC, the
  legal professions (Ch 11) and the court system (Ch 5).
- **LGL225's Immigration Reference Tool Kit gates the Sept 30 quiz (20%)** — the
  tool kit is the *only* material you are allowed to bring, so it has to be
  finished first. Get the IRCC forms from canada.ca, not a search engine; the
  handout says so because they go stale.
- **The week of Mon 19 Oct is the hardest week of the term**: LGL151 midterm 30%
  on the Monday, then LGL156 midterm 40% + LGL160 midterm 25% + LGL154
  Assignment #2 all on Wed 21 Oct. Crunch shows it as the tallest bar before
  December.
- **Sixteen of your thirty-five graded items are dated only to a week**, not a
  day. Those appear in a dashed band on This Week rather than being quietly
  filed onto a Monday. Ask in class which day, then correct the file.
- **Your exams are mostly not cumulative, but read each one literally.** LGL153
  splits cleanly (1–4, 5–7, 8–10). LGL152's Test #2 re-covers chapters 11–12.
  LGL225's final re-covers chapters 3 and 6 and skips 1, 2, 7 and 9. Eleven
  exams and tests don't say at all — see the Review screen.
- **LGL225's midterm and final are open book.** That changes how to study for
  it: build the lookup, don't memorise.

## Where everything lives

```
syllabi/      the 8 original syllabi, untouched
handouts/     presentation instructions, immigration tool kit
data/         the dataset -- plain CSV, opens in Excel
notes/        your notes, plain Markdown
app/          the three files the page is made of
build/        each syllabus table read row by row -- what the data is checked against
tools/        scripts that check the app; you never need to run these
```

`data/` is the real thing; every screen is built from it. `data/schedule.csv`
keeps the **verbatim syllabus wording** beside every date and reading
(`date_raw`, `reading_raw`), so if a figure ever looks wrong you can trace it
back to a page of the original PDF in seconds.

## About the Timetable screen, and a question it raises

`data/timetable.csv` is the only file in `data/` that did not come out of a
syllabus — it is your Seneca enrolment listing, the one that says *Enrolled*
beside each class. It gives a start time and a room for every class but never a
finish, so six blocks are drawn 45 minutes tall with a dashed foot. That height
is only so there is something to see; it is not a claim about how long the class
runs. If you find the finish times, put them in the `end` column.

**Three courses meet on a different day from the one their syllabus describes**,
and that is not settled:

| | the syllabus | you are enrolled |
|---|---|---|
| LGL151 | Mon — and every LGL151 row in `data/schedule.csv` is a Monday | **Tue 1:30pm**, A-A4526 |
| LGL152 | section NPE: Thu 2:25pm online, Fri 8:00am A-A4513 | **Thu 11:40am online**, **Fri 9:50am** A-A3518 |
| LGL156 | section NPE: Wed 5:10pm C-C3036, Thu 9:50am online | **Tue 11:40am** A-A4519, **Thu 1:30pm online** |

Worth sorting out, because LGL152 and LGL156 date work to *during in person
class* — so their in-person day is the day that work is due, and it has moved.
Nothing in the schedule or the deadlines has been changed on the strength of
this. The question to answer first is whether the syllabi you have are for your
own sections; if one is for another section, its dates are wrong all the way
through, not just its weekday.

## The wiki next door

`../paralegal-wiki` is your other project: the one where Claude Code writes up
doctrine, cases and statutes as you ingest lectures. It knows the law; this one
knows the calendar. To hand it the calendar:

```
python export_schedule.py
```

That writes one file per course into the wiki's `context/` folder — every class
with its real date, the chapters the syllabus assigned, the LSO competencies,
and every deadline. The wiki reads those when it writes up a lecture, so a page
gets the true class date instead of the day you happened to ingest it. Run it
again whenever you change something in `data/`.

Dates, deadlines and chapters are **this** project's to fix; doctrine is the
wiki's. If a date is wrong in the wiki, fix it here and re-run the export.

## If a professor changes something

Edit the row in `data/schedule.csv` or `data/assessments.csv`, then:

```
python validate.py
```

It checks the things that actually go wrong: that each course's weights still add
to 100%, that no single item exceeds Seneca's 40% cap, that every date is inside
the term and falls on that course's own meeting day, and — most importantly —
that every chapter, page range, deadline and percentage appears **in the row of
the syllabus with that same date**. If you move an assessment to a week the
syllabus doesn't put it in, it says so. It never edits anything; it just tells
you.

Then add a line to `data/changes.md` saying what changed and **where you heard
it** (in class? on Blackboard? by email?). In November, when two sources
disagree, that line is the whole point.

## A caution

This was built from the syllabi as they were on **11 Sep 2026**. Syllabi change,
and the change usually arrives in class or as a Blackboard announcement — not as
a new PDF. Treat Learn@Seneca as the authority and this as the plan.

If something here disagrees with your syllabus, **the syllabus wins** — tell me
and I'll fix it. One real example is already in `data/changes.md`: LGL151's Quiz
#1 and presentations were both recorded a week early, because each is the first
line of its table cell and flattened text puts that under the previous week. The
extractor and the validator were both rebuilt around that, but keep checking.
