# The Claude Design reference

Rafael designed the app's look in Claude Design on 13 Sep 2026 and exported
it. This folder keeps the parts of that export the app was built from, so the
source of the look is versioned beside the code.

| File | What it is |
|---|---|
| `Paralegal Beagle.dc.html` | The design canvas: a Claude Design component with the templates for This Week, Term Grid, Crunch and Deadlines, plus stubs for the other four views. Open it in a browser next to `support.js` to see the design as it was. |
| `support.js` | Claude Design's runtime, needed only to render the canvas file. Not used by the app. |
| `modernist-readme.md` | The guide to the design system the canvas was built on, called Modernist. |
| `modernist-styles.css` | That system's tokens and components. Uses Google Fonts and a red that fails contrast for body text — see below. |
| `canvas-light-1440.png`, `canvas-dark-1440.png` | The canvas rendered at desktop width in both themes, the day it was exported. |

## What the app took from it

The structure, wholesale: the sidebar with counts, the ruled rows, square
corners, the three deadline cards with big countdowns, the readings as a
keyed two-column table, the term runway, the month-sectioned deadline list,
the Term Grid with a 74px week column, the Crunch bars with chips beneath.

## What the app changed, and why

- **Archivo became Bahnschrift.** Archivo loads from Google Fonts; the app
  runs offline and the server has no route for a font file. Bahnschrift is
  installed on Windows 11, and its weight axis was verified to work.
- **The red was split in two.** The reference's `#ec3013` measures 3.8:1 on
  the page ground, which its own guide admits is "not for body copy". The app
  uses it only as a mark (rails, bars, numbers of 22px and up) and a deeper
  `--accent-text` for any word in red.
- **The eight course colours came back** as a rail on each course pill, a rule
  on each grid column, and the segments of the Crunch bars. The reference had
  dropped them, leaving red to mean four things at once.
- **The phone layout was added.** The reference overflows by 118px at 412
  wide because its sidebar never collapses.
- **Nothing in the data was abbreviated.** The reference shortened syllabus
  text to fit its rows; two of LGL152's four week-one cases were dropped. The
  app renders the CSV verbatim, so rows are longer than the design assumed.

Do not re-import `modernist-styles.css` into the app. It is a record, not a
dependency.
