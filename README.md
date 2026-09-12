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

## The tabs

| Tab | What it's for |
|---|---|
| **This Week** | Start here. It opens with the four things that matter: how many days until the next graded item, how many of this week's chapters you have read, how many you are behind, and which week ahead is the heaviest. Then the whole term as one strip of fifteen blocks you can click. Then your readings, grouped by the class they belong to, beside a list of what is due. |
| **Term Grid** | All fifteen weeks by all eight courses on one screen. Holidays, study week and the drop deadline get their own rows. There is a button to hide the chapter numbers when you only want to see deadlines. |
| **Crunch** | How much of your final grade falls due each week, added up across all eight courses, drawn as a bar per week and coloured by course. Nobody else can produce this for you — each professor sees only their own course. |
| **Exams** | Every exam, test and quiz: the date, the weight, and **exactly which chapters it covers** where the syllabus says so. Where it doesn't, it says so instead of guessing. |
| **Courses** | One course at a time: the details, your grade standing, every assessment, and the full schedule with tick-offs. |
| **Notes** | Your reading notes, filed by course and week. Plain Markdown files in `notes/` — write them here or in any editor. |
| **Cases** | Case briefs with style of cause, citation, CanLII link, and whether you have actually verified it. |
| **Review** | The questions the syllabi left open. Worth one sitting to clear. |

## Getting around

- Click the circle beside a chapter to cycle it: not started → in progress →
  done. **All done** clears a whole course's week at once. Your progress lives
  in `data/progress.csv` and survives everything else.
- On This Week, **‹ week** and **week ›** step through the term. The `[` and `]`
  keys do the same. **Back to this week** returns you to today.
- Click any week in the term strip to jump to it. Click a course code anywhere
  to open that course.
- The **auto / light / dark** button in the top right follows Windows by
  default, or you can pin it either way. It remembers your choice.
- Every tab has its own web address, so you can bookmark one. `#exams` opens
  Exams; `#courses/LGL225` opens Immigration Law; `#week/7` opens week 7.

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
  exams and tests don't say at all — see the Review tab.
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
