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

## The tabs

| Tab | What it's for |
|---|---|
| **This Week** | What to read this week, what's due in the next fortnight, what to start now, and anything you haven't read from earlier weeks. Start here. |
| **Term Grid** | All 15 weeks × all 8 courses on one screen. Study week shaded, this week highlighted. |
| **Crunch** | How much of your grade falls due each week, added up across all eight courses. Nobody else can see this — each professor sees only their own course. |
| **Exams** | Every exam, test and quiz: the date, the weight, and **exactly which chapters it covers** where the syllabus says so. Where it doesn't, it says so instead of guessing. |
| **Courses** | One course at a time: full schedule, tick off readings, enter marks, see what you need on what's left. |
| **Notes** | Your reading notes, filed by course and week. Plain Markdown files in `notes/` — write them here or in any editor. |
| **Cases** | Case briefs with style of cause, citation, CanLII link, and whether you've actually verified it. |
| **Review** | The questions the syllabi left open. Worth one sitting to clear. |

Click the circle beside a chapter to cycle it: not started → in progress → done.
Your progress lives in `data/progress.csv` and survives everything else.

## Things worth knowing right now

- **LGL151 Quiz #1 (15%) is the week of Mon 14 Sep.** The reading is Chapter 5,
  the court system.
- **LGL225's Immigration Reference Tool Kit gates the Sept 30 quiz (20%)** — the
  tool kit is the *only* material you're allowed to bring, so it has to be
  finished first. Get the IRCC forms from canada.ca, not a search engine; the
  handout says so because they go stale.
- **The week of Mon 19 Oct is the hardest week of the term**: LGL151 midterm 30%
  on the Monday, then LGL156 midterm 40% + LGL160 midterm 25% + LGL154
  Assignment #2 all on Wed 21 Oct.
- **Your exams are mostly not cumulative, but read each one literally.** LGL153
  splits cleanly (1–4, 5–7, 8–10). LGL152's Test #2 re-covers chapters 11–12.
  LGL225's final re-covers chapters 3 and 6 and skips 1, 2, 7 and 9. Five courses
  don't say at all — see the Review tab.
- **LGL225's midterm and final are open book.** That changes how to study for it:
  build the lookup, don't memorise.

## Where everything lives

```
syllabi/      the 8 original syllabi, untouched
handouts/     presentation instructions, immigration tool kit
data/         the dataset -- plain CSV, opens in Excel
notes/        your notes, plain Markdown
build/        text dumps of the syllabi, for checking the data
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
the term and falls on that course's own meeting day, and that every figure still
matches the source syllabus. It never edits anything — it just tells you.

Then add a line to `data/changes.md` saying what changed and **where you heard
it** (in class? on Blackboard? by email?). In November, when two sources
disagree, that line is the whole point.

## A caution

This was built from the syllabi as they were on **11 Sep 2026**. Syllabi change,
and the change usually arrives in class or as a Blackboard announcement — not as
a new PDF. Treat Learn@Seneca as the authority and this as the plan.
