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

## 2026-09-25 — Rafael's Block NF timetable, and three courses that disagree with it

New file `data/timetable.csv`: eleven class blocks, transcribed from a picture
of Rafael's own Seneca timetable for the week of Mon 14 Sept 2026, headed
**Block NF**. It is the first thing in `data/` that did not come out of a
syllabus, which is why every row carries `source` and `confidence`.

**Five blocks corroborate the syllabi exactly** and are recorded `high`:
LGL225 Wed 8:55–10:40, LGL154 Wed 12:35–14:20, LGL160 Wed 14:25–17:05,
LGL250 Tue 17:10–18:55 and LGL250 Thu 9:50–10:40.

**Six do not, and are recorded `low`** — their times were read off the picture,
not stated anywhere in words:

| | the syllabi say | the timetable shows |
|---|---|---|
| LGL151 | `Mon`, no time; every schedule row is a Monday | **Tue** about 1:15–3:55pm |
| LGL152 | section **NPE**, Thu 2:25–4:10pm online + Fri 8–9:45am A-A4513 | section **NPF**, **Thu** about 11:50–1:10 + **Fri** about 10:05–11:45 |
| LGL156 | section **NPE**, Wed 5:10–6:55pm C-C3036 + Thu 9:50–10:40am online | section **NPF**, **Tue** about 11:50–1:10 + **Thu** about 2:25–3:05 |
| LGL153 | `Fri`, no time | Fri about 2:25–3:45pm — the day agrees, the hours are new |

**Nothing else was changed.** `courses.csv`, `schedule.csv` and
`assessments.csv` still say what the syllabi say, and `validate.py` still
passes. The disagreement is shown on the Timetable screen instead of being
resolved by guesswork.

**Why it matters beyond the picture.** LGL152 and LGL156 both date work to
*during in person class* (`date_precision: week`). If Rafael is in NPF rather
than NPE, the in-person day moves, and so does the day that work is due.

**Authority:** a screenshot Rafael supplied on 25 Sep 2026. He has not yet said
whether the timetable or the syllabi reflect his actual enrolment. **Open
question — do not resolve it by picking the more recent source.**

## 2026-09-25 (later) — the enrolment listing replaces the times read off the picture

Rafael pasted his Seneca enrolment listing — each class with its start time and
room, every line reading **Status: Enrolled**. `data/timetable.csv` was rewritten
from it. It corrects six of the eleven start times I had read off the picture of
his timetable earlier the same day, some by as much as an hour:

| | read off the picture | his enrolment says |
|---|---|---|
| LGL156 Tue | 11:50 | **11:40**, Newnham A-A4519 |
| LGL151 Tue | 13:15 | **13:30**, Newnham A-A4526 |
| LGL152 Thu | 11:50 | **11:40**, online |
| LGL156 Thu | 14:25 | **13:30**, online |
| LGL152 Fri | 10:05 | **09:50**, Newnham A-A3518 |
| LGL153 Fri | 14:25 | **13:30**, online |

The five that matched the syllabi still match, rooms included. Every row is now
`confidence: high`, and the earlier `low` rows are gone — nothing in that file
is a reading of a picture any more.

**What the listing does not give is end times.** Five blocks take theirs from a
syllabus; the other six have no finish time stated anywhere. Those are drawn 45
minutes tall with a dashed foot and read "11:40am –". The 45 is a drawing
decision so the chart has something to show; nothing is computed from it and no
duration is claimed. Ask in class, or look for the finish time in the Student
Centre.

**The section question is answered, and it is the enrolment listing that wins.**
Three courses meet on a different day from the one their syllabus describes:

| | the syllabus | enrolled |
|---|---|---|
| LGL151 | Mon (and every LGL151 row in `schedule.csv` is a Monday) | **Tue 1:30pm**, A-A4526 |
| LGL152 | NPE: Thu 2:25pm online, Fri 8:00am A-A4513 | **Thu 11:40am online**, **Fri 9:50am** A-A3518 |
| LGL156 | NPE: Wed 5:10pm C-C3036, Thu 9:50am online | **Tue 11:40am** A-A4519, **Thu 1:30pm online** |

It also answers **open question 3**: LGL156 and LGL250 do *not* clash on
Thursday morning. LGL250 is online at 9:50; LGL156 is online at 13:30.

**Still not changed, on purpose:** `courses.csv`, `schedule.csv` and
`assessments.csv`. Re-dating LGL151's fourteen class rows from Monday to
Tuesday, and moving LGL152's and LGL156's in-person days, would move the day
that work dated "during in person class" is due. Before any of that, Rafael
needs to establish whether the syllabi he holds are his own sections' — a
syllabus for the wrong section would have the wrong dates throughout, not just
the wrong weekday.

**Authority:** Rafael's Seneca enrolment listing, pasted 25 Sep 2026.

## 2026-09-26 — the class listing completes the timetable, and names the sections

Rafael supplied his Seneca class listing: each course with its full meeting
range, its room, its **class number** and *Enrolled*. `data/timetable.csv` is
now complete — eleven blocks, every one with both ends, a room and a class
number, all `confidence: high`. The six finish times that nothing had stated:

| | |
|---|---|
| LGL156 Tue | 11:40am – **1:25pm**, A-A4519 |
| LGL151 Tue | 1:30pm – **4:10pm**, A-A4526 |
| LGL152 Thu | 11:40am – **1:25pm**, online |
| LGL156 Thu | 1:30pm – **2:20pm**, online (fifty minutes, the short block of the week) |
| LGL152 Fri | 9:50am – **11:35am**, A-A3518 |
| LGL153 Fri | 1:30pm – **3:15pm**, online |

His week is **19.3 hours** of class across eleven blocks, six on campus and
five online, with **no Monday class at all**.

**The class numbers settle the section question.** Five match `courses.csv`
exactly — LGL154 3967, LGL160 4536, LGL225 5370, LGL250 3593. Two do not:

| | `courses.csv` (from the syllabus on file) | he is enrolled in |
|---|---|---|
| LGL152 | class **3966**, section **NPE** | class **4533**, section **NPF** |
| LGL156 | class **4050**, section **NPE** | class **4535**, section **NPF** |

So the LGL152 and LGL156 syllabi in `syllabi/` are **for sections he is not in**.
LGL151 is a third case: no class number was ever recorded for it, his listing
says class 4532 meeting Tuesday, and every LGL151 row in `schedule.csv` is a
Monday.

**Still not changed, on purpose:** `courses.csv`, `schedule.csv`,
`assessments.csv`. A syllabus for another section may differ in more than its
weekday — the reading schedule and the assessment dates could differ too — so
re-dating rows one at a time would be guessing at which parts carry over.
Rafael needs the NPF syllabi for LGL152 and LGL156, and to confirm which
section's LGL151 syllabus he holds. Then this can be redone properly.

**Authority:** Rafael's Seneca class listing, 26 Sep 2026.

## 2026-09-26 — LGL151 Quiz #1 was written on Tuesday 22 Sept

| field | old | new |
|---|---|---|
| due_date | *(blank)* | **2026-09-22** |
| due_week_of | 2026-09-21 | 2026-09-21 *(kept — it is what the syllabus says)* |
| date_precision | `week` | `exact` |
| source_file | LGL151 | `announced` |

**Authority:** reported by Rafael, 26 Sep 2026. He saw the quiz still showing on
Upcoming as "1 day left" and said it had been written on the Tuesday. He is
enrolled in LGL151 on Tuesdays (class 4532, Tue 1:30–4:10pm), so the week-of-21
-Sept quiz fell in the Tuesday 22 Sept class. It now reads as done rather than
pending.

### The general form of this, still open

Sixteen assessments are dated only to a week, and the app treats such an item as
live until its Sunday — which is right when nobody knows the day, and wrong now
that `data/timetable.csv` says which day each course actually meets. A quiz "in
the week of 21 Sept" for a course that meets only on Tuesday happens on the
Tuesday.

Resolving them that way would be using evidence rather than inventing a weekday,
which is what the rule against inventing one was guarding. **It has not been
done**, because three of those courses (LGL151, LGL152, LGL156) are the ones
whose syllabi describe a section he is not enrolled in, so their meeting days in
`schedule.csv` cannot yet be trusted. Settle the section question first, then
this becomes a single clean change.

## 2026-09-26 — LGL160 presentation outlines moved to Friday 25 Sept

| field | old | new |
|---|---|---|
| due_date | 2026-09-28 | **2026-09-25** |
| source_file | LGL160 | `announced` |

**Authority:** reported by Rafael, 26 Sep 2026. He noticed it was still listed
as upcoming and said it had been moved to the Friday. He did not say whether
that came from class, Blackboard or email — worth noting here when known.

The syllabus still reads "Presentation outlines due: September 28th at
12:00 p.m.", and `due_date_raw` keeps that wording. `source_file: announced`
tells `validate.py` not to look for the new date in the syllabus.



## 2026-09-26 — LGL160 in-class quiz dated to the day, and a week-window bug

Rafael checked Upcoming against the Weekly Calendar and found the LGL160
in-class quiz still counting down — three days left, for a quiz he sat on
Wednesday the 23rd. Two separate things were wrong.

**The quiz itself.**

| field | old | new |
|---|---|---|
| due_date | *(empty)* | **2026-09-23** |
| date_precision | week | **exact** |

**Authority:** reported by Rafael, 26 Sep 2026 — he sat it. The date is not new:
it is the class day the syllabus's own row names ("week of 9/23", a Wednesday).
Only the precision changed, so `source_file` stays `LGL160` and `validate.py`
still checks the row carries its 15%.

**The window, which was the real defect.** `resolve_due()` returned
`due_week_of` verbatim, and the client finds the last day of a week-precision
window by adding six days to it. That is right when the value is a Monday — and
eleven rows are not Mondays, because their syllabus prints the course's own
class day: LGL152's three Thursdays, LGL156's four Wednesdays, LGL160's four
Wednesdays. Those windows ran up to four days into the NEXT week, so items
stayed live after their week had gone and nothing was ever called late on time.
`resolve_due()` now returns the Monday of the week the value falls in. No CSV
value changed for this: `due_week_of` must keep the printed class date, because
that is what `validate.py` matches against the real class row.

Week numbers are unaffected — the Monday of a week is in the same week as any
other day of it — so the Weekly Calendar, which places items by week number,
showed the right thing throughout. That is why comparing the two screens found
this.


## 2026-09-26 — LGL151 case presentation: date unknown, not week-dated

| field | old | new |
|---|---|---|
| date_precision | week | **unknown** |

**Authority:** reported by Rafael, 26 Sep 2026. Upcoming was counting down
"2 days" to it. The presentation slot changes from student to student, so the
syllabus's "week of Sept. 28" is when presentations BEGIN for the course, not
when he presents; his own date is posted to Blackboard.

`due_week_of` still holds 2026-09-28, so `validate.py` rule 8 still matches the
class row and checks it carries its 15%, and the weight still counts toward
LGL151's 100. `resolve_due()` returns no date for `unknown`, which is what
keeps it off the Weekly Calendar and Upcoming. `validate.py` prints it as a
note on every run so it cannot vanish quietly.

**When Blackboard gives him the date:** set `due_date`, set `date_precision`
back to `exact`, and record the authority here. It reappears on both screens by
itself.

## 2026-09-26 — Upcoming's horizon is a week, not a rolling fortnight

Not a data change; recorded because it changes what the screen means. Upcoming
listed everything within a rolling 7 and 14 days of today. It now shows the
five business days of the week it is standing in, selected by `week_no` — the
same number the Weekly Calendar places by, so the two screens now agree by
construction rather than by coincidence. Rafael asked for this on 26 Sep 2026,
the same day comparing those two screens found the week-window bug above.


## 2026-09-26 — LGL152 Midterm Test #1 dated to Fri 2 Oct

| field | old | new |
|---|---|---|
| due_date | *(empty)* | **2026-10-02** |
| date_precision | week | **exact** |
| source_file | LGL152 | `announced` |

**Authority:** Rafael, 26 Sep 2026 — "torts class is on friday before legal
entities". This is two things he had already given, read together rather than a
new fact: the syllabus says "MIDTERM TEST #1 (30%); Chapters 9-12; During in
person class -- week of 10/1", and his enrolment listing puts LGL152 in person
on Fridays at 09:50 in A-A3518. Friday of the week of 10/1 is **2 Oct**.

`source_file: announced` because 2 Oct is not an LGL152 row in `schedule.csv` —
that file still follows the NPE syllabus's Thursdays, and is not being re-dated
until the section question is settled. The cost of `announced` is that
`validate.py` stops checking the 30% against the syllabus row; the weight is
unchanged and LGL152 still sums to 100.

**This settles open question 5.** LGL152's midterm and LGL153's Test 1 are both
Fri 2 Oct — the midterm at 09:50, the test at 13:30. Not a clash, but a heavy
day: 60% of two courses in one afternoon.

**Still open, and larger:** fifteen other week-precision items could be resolved
the same way, by reading each course's syllabus wording against
`data/timetable.csv`. Not done, for the reason recorded on 25 Sep: LGL151,
LGL152 and LGL156 are the courses whose syllabi describe sections he is not
enrolled in, so their meeting days cannot be trusted wholesale. Doing them one
at a time as Rafael confirms them — as here — is the safe path.

---

## 28 Sep 2026 — the phone scroller, and the calendar's own order

**No data changed.** Both are interface, recorded here because the second is a
stated preference rather than a bug, and preferences need an authority the same
way a date does.

**1. Scrolling stuck at the foot of the list.** Rafael, twice: "scrolling can be
a bit finnicky when you get to the bottom of the page, trying to scroll back up
can be unresponsive", then "still getting stuck occasionally... I can resolve it
by scrolling down and then back up". The cause was `-webkit-overflow-scrolling:
touch` on `#main` — obsolete since iOS 13, and its documented failure is exactly
that: the gesture after an overscroll is swallowed settling the momentum layer.
Removed. It was also breaking `position: sticky` on `.calbar` in its own
descendants, which is the week stepper he asked to have stay put on 27 Sep.

Found while looking: `render()` restored `window.scrollY`, but below 900px the
window does not scroll — `#main` does — so **every tick threw the phone list
back to row one.** It now restores whichever scroller is live. Stepping the week
deliberately does not: that is new content and starts at its top.

**2. The phone calendar runs in `WEEK_ORDER`.** Rafael, 28 Sep 2026: "in calander
the classes should be organized the same horizontally down as they are vertically
across in the website app", with the eight courses listed in that order. It was
sorted by class date, so the phone and the desktop disagreed about the same week.
Now LGL156, LGL151, LGL250, LGL225, LGL154, LGL160, LGL152, LGL153 on both.
**Authority:** Rafael, a preference — not derived from any syllabus, which is why
it lives in `app.js` beside `WEEK_ORDER` and not in `data/courses.csv`.
