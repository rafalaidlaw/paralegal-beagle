# tools/ — checking the app, not the data

`validate.py` checks the **data**. Nothing in it can tell you that a chip is
43px tall, that a column is clipped on a phone, or that grey-on-grey text has
fallen below 4.5:1. These do that.

They are **development tools only**. The app itself is still Python standard
library plus vanilla HTML/CSS/JS, with no build step and nothing downloaded.
Rafael never needs to run any of this to use the tracker.

## What each one is for

| | |
|---|---|
| `viewtest.mjs` | Renders all eight views against the real `/api/data` in a DOM shim and fails if one throws, renders almost nothing, or leaks `undefined` / `NaN`. The fastest check; run it after any change to `app.js`. |
| `probe.mjs` | Reports every element that sticks out past the viewport, ignoring anything inside a deliberate scroll container. This is how you check a phone layout — **not** by looking at a screenshot. |
| `shot.mjs` | Screenshots each view at 1440px dark, 1440px light and 412px dark, setting the CSS viewport and the colour scheme over the DevTools protocol. |
| `measure.mjs` | Prints the box, font, padding and resolved family of any selector. Use it when something looks wrong but you cannot tell why. |
| `statictest.mjs` | The only one that tests `dist/` rather than the running app: that the published page renders from `data.json` with no server, that it takes today's date from the browser instead of the frozen build stamp, and that a chapter tick saves to `localStorage` and survives a reload. Run `python build_static.py` first; it serves the folder itself, so 8787 can stay busy. |
| `interact.mjs` | Clicks through the things a static render cannot reach: the chapter tick through its three states, the per-course master tick, the theme toggle against both system schemes, week stepping by button and by key, deep links, and the sort toggle; a tick made in the Weekly Calendar showing on This Week (and back), the grid's sideways scroll surviving a tick, and the LSO competency lines on all three. Asserts against the server, so it proves persistence too. |
| `contrast.py` | WCAG 2.1 contrast for every pair in the palette. No third-party code. |

## Running them

The server must already be running (`python serve.py`). Then, from the repo root:

```
python validate.py                  # the data
node tools/viewtest.mjs             # every view renders
node tools/probe.mjs week 412       # overflow at phone width
node tools/shot.mjs shots           # screenshots, both themes
node tools/interact.mjs             # the interactive paths
python tools/contrast.py            # the palette
```

`viewtest.mjs` reads `PORT` (default 8792); the others assume 8787.

`interact.mjs` **writes to `data/progress.csv`** through the real API and clears
up after itself. It leaves the file header-only, which is its starting state
today — but if Rafael has ticked real chapters by then, back that file up first.

Node is used only here, for the browser protocol. Nothing in `app/` depends on
it.

## The gate for a presentation change

There is no test that can tell you a layout is *good*. What these can tell you
is that it is not *broken*, which is a different and cheaper question:

1. `validate.py` exits 0.
2. `viewtest.mjs` passes.
3. `probe.mjs` is clean for all eight views at 412, 900 and 1440.
4. `interact.mjs` passes and `data/progress.csv` is as you found it.
5. `contrast.py` shows nothing carrying content below 4.5:1.
6. Look at the screenshots, in both themes.

Step 6 is the one that actually catches design problems, and the only one a
machine cannot do for you.
