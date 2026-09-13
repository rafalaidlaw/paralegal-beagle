# Design brief: Paralegal Beagle

Paste this into Claude Design when setting up the design system, and upload
`app/app.css`, `app/index.html` and the screenshots alongside it.

---

## What this is

A private study tracker for one person. Rafael is a first-semester student in
Seneca Polytechnic's Paralegal Accelerated diploma, carrying **eight courses at
once**. The app turns eight syllabi into two answers: what do I have to read
this week, and what is due next.

It runs only on his own computer, from a small Python server, with no internet
connection required. It is not a product, has no other users, and will never
have a marketing page.

Eight views: This Week, Term Grid, Crunch, Exams, Courses, Notes, Cases, Review.

## Who reads it and where

- A Windows 11 desktop, **dark mode**, at a desk. This is the main case.
- A phone at 412px wide, occasionally, to check what is due.
- Paper, rarely, for the term grid.

He is a paralegal student, not a designer or a programmer. The interface has to
be legible at a glance on a Saturday morning while he plans a week of work.

## The register

Closer to a **law-school bench copy** than to a SaaS dashboard. It is a working
document about statutes, cases and deadlines. Warm neutral paper or ink grounds,
one restrained accent, serif for identity and sans for operational text. Calm
and dense rather than airy and decorative.

It should not look like a startup analytics product, and it should not look like
an unstyled Word document.

---

## Hard constraints

These are not preferences. A design that breaks one of them cannot be built.

1. **Vanilla CSS only.** No framework, no CSS-in-JS, no preprocessor, no build
   step. One stylesheet, hand-edited.
2. **Nothing may be downloaded at runtime.** No CDN, no Google Fonts, no icon
   package, no external image. The server serves exactly three files and has no
   route for an asset, so a bundled font file is also out of scope.
3. **Fonts must already be installed on Windows 11.** The resolving families
   were verified by measurement:
   - Sans: `"Segoe UI Variable Text"`, `"Segoe UI Variable Small"`,
     `"Segoe UI Variable Display"`, `"Segoe UI"`
   - Serif: all six Sitka optical sizes resolve — `Sitka Text`, `Sitka Small`,
     `Sitka Subheading`, `Sitka Heading`, `Sitka Display`, `Sitka Banner`
   - Mono: `Cascadia Mono`, `Consolas`
   - **Bare `"Segoe UI Variable"` does NOT resolve.** Never put it in a stack.
     `Aptos` and `Inter` are not installed.
4. **Dark is the primary theme**, light is the second. Both must be complete.
   No colour may be defined only inside a media query.
5. **Everything must work at 412px** with no horizontal scrolling of the page.
6. **Every colour carrying content clears 4.5:1**, measured with the WCAG 2.1
   formula, not estimated.
7. **Colour is never the only carrier of meaning.** There must always be a word,
   a shape, or a number saying the same thing.
8. **No animation** beyond an instant state change, and it must respect
   `prefers-reduced-motion`.
9. **Icons must be typographic.** No icon font, no SVG sprite. A unicode glyph
   or a CSS shape only.

---

## What already exists and should be preserved

The current stylesheet has a working token layer. Treat it as the starting
point, not as something to replace. Read `app/app.css`; the contrast figure
beside each colour was measured.

- **Four surfaces**: page, panel, card/row, control.
- **Four ink steps**, of which the fourth is decorative only and deliberately
  fails contrast. Nothing with content may use it.
- **One accent, oxblood.** It touches four things and nothing else: links, the
  active tab, the focus ring, and the current-week marker. It must not become a
  decorative fill.
- **Semantic colours by assessment type**: exam and test, quiz, assignment and
  presentation, milestone, and a positive for "stated in the syllabus".
- **Eight course hues**, one per course, all clearing 4.5:1 on both dark
  grounds. They appear only as a dot, a three-pixel rail, a column-header rule
  or a bar segment. Never as a filled cell.
- **A heat ramp** mixing the accent into a surface, capped so a label stays
  legible, with the magnitude above the cap carried by the height of a fill
  instead of more colour.
- **Serif carries identity only.** It never enters a table cell, a chip, a
  button or a date.
- **Tabular lining figures** wherever one number is compared with another.
- **No italics anywhere.** They reduce legibility, and Windows' own type ramp
  omits them.

---

## What to create

A component library, as preview cards, in **both themes**, with every state
shown rather than described. Group it like this.

**Foundations**
- Colour: all four surfaces, four inks, the accent, the six semantic colours,
  the eight course hues, and the heat ramp at five steps. Both themes side by
  side, each swatch labelled with its measured contrast against the surface it
  sits on.
- Type: the full ramp, each step shown at its real size with its family, weight,
  line height and tracking, and a note on what it is for.
- Spacing: a scale, see below.
- Radius, hairlines, and the two border weights.

**Chips and labels**
- The type chip in all thirteen variants that exist today: exam, test, quiz,
  assignment, presentation, milestone, study week, plus the status variants ok,
  hot, warn, cool, the dashed "not stated" chip, and the single filled
  "overdue" chip.
- The course pill, with its course-colour rail, and the ten-pixel course dot.

**Data display**
- Stat tile, including the one oversized countdown number.
- Heat cell, as used in a fifteen-cell term strip.
- Stacked bar: one row per week, segments sized by weight, with a dashed
  reference line and a right-aligned figure.
- Thin progress bar.
- Key/value definition list.
- A dense table row, and the same row as it appears stacked on a phone.

**Controls**
- Buttons: default, ghost, and toggle, each in rest, hover, focus, active and
  **disabled**.
- The chapter chip, which contains its own tick, in three states: not started,
  in progress, done.
- Select, number input, checkbox, and a disclosure summary.

**Blocks**
- Panel, callout in three tones, dashed advisory band, class-meeting block,
  due row, exam card, empty state, legend, month separator.

**Navigation**
- The tab bar, including how it behaves when it does not fit.
- The term strip.

---

## The six problems worth solving

This is the part that matters. The app works; it is the consistency underneath
that is thin. Each of these is measured from the current stylesheet.

1. **There is no spacing scale at all.** Zero spacing tokens are defined, and
   the values were counted: **33 distinct padding declarations and 14 distinct
   gaps**. Almost every one was chosen by feel. Define a short scale, map every
   existing value onto it, and say which step to use in which situation. This
   is the single biggest gap.

2. **Radius is inconsistent.** Eight different values are in use. Reduce it to
   two or three with a stated rule for each.

3. **The type ramp is loose.** Ten distinct sizes are in use: 12, 13, 14, 15,
   16, 17, 18, 20, 22 and 40 pixels. Several are a single pixel apart and do no
   work. Tighten it, hold 12 pixels as an absolute floor for anything carrying
   content, and say what each step is for.

4. **Interactive states are barely covered.** There is one focus rule in the
   whole stylesheet and **no disabled styling at all**, yet three controls
   disable themselves: the two week-stepper buttons at the ends of the term,
   and the master tick while it saves. Produce a complete state matrix.

5. **The chip system conflates two axes.** Some chips say what kind of thing an
   item is, some say what state it is in, and they look alike. Separate them
   deliberately, or prove they should stay unified.

6. **Density needs a defensible answer.** Eight courses on one screen is
   genuinely a lot of information, and the current density was reached by
   feel. Propose a row height, a line height and a spacing rhythm for dense
   tables, and show the same content at that rhythm.

---

## What not to do

- **Do not invent content.** Course names, dates, chapter numbers and weights
  are real. If you need filler, use the real values from the screenshots.
- **Do not propose anything needing a library, a font file, or a network call.**
- **Do not give the accent a second meaning**, and do not introduce a second
  accent.
- **Do not encode anything by colour alone**, and show what each component looks
  like when the operating system removes colour entirely.
- **Do not soften the honest bits.** Where the app says a fact is missing from
  the syllabus, that has to stay visible. It is drawn as absence, in a dashed
  neutral chip rather than a red one, because twenty-seven of thirty-five
  assessments state no scope and in red the missing information became the
  loudest thing on the page. Keep that judgement.
- **Do not add depth.** No drop shadows. Separation comes from the four
  surfaces and the two hairline weights.

---

## How the result will be judged

1. It can be built in one hand-edited stylesheet with no new dependency.
2. Every content colour clears 4.5:1 in both themes, re-measured.
3. Nothing overflows at 412 pixels.
4. A week's readings and the next deadline are still findable in about five
   seconds.
5. The spacing, radius and type scales are short enough to remember.
