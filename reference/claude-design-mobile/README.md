# The mobile design reference

Rafael designed the phone version of the app in Claude Design on 27 Sep 2026
and exported it. This folder keeps the source of that look beside the code, the
same way `../claude-design/` keeps the September desktop design.

| File | What it is |
|---|---|
| `Beagle Mobile.dc.html` | The canvas: one Claude Design component holding all three phone screens, the detail sheet, and a hardcoded copy of the term's data for the preview. |
| `_ds_bundle.js` | The design system's component bundle. **Empty** — `"components": []`. Everything in the canvas is written inline, so there was nothing to import. |
| `archivo-variable.woff2` | Archivo, the face the design was drawn in. Shipped as `app/archivo.woff2`. |

`styles.css` and `support.js` are **not** kept here: both are byte-identical to
the copies already in `../claude-design/`. The design system did not change
between the two exports, so there were no new tokens to reconcile — the whole
difference is layout.

## The font, and why it ships

The design's font stack is `Bahnschrift, 'Segoe UI Variable Text', 'Archivo',
system-ui` — Archivo is **third**. On Windows nothing reaches it and desktop
rendering is unchanged, which the pixel comparison confirms: all three screens
are byte-identical before and after, in both themes.

The phone is the reason. A phone has neither Bahnschrift nor Segoe UI Variable,
so before this the app fell all the way through to the device's system font and
stopped looking like itself. Archivo on Google Fonts is a **variable** font, so
the three weights the design asks for (400/600/800) are one 35KB file — the
three downloads from the browser extension were byte-identical.

This is the first asset `serve.py` has ever served. The route names the file
explicitly rather than opening a directory: it stays a three-file server with
one exception, not a static host.

## What the app took, and what it did not

Taken whole: the fixed phone shell with a header that never moves; the
three-strip header (brand + theme, the week, the tabs); the calendar as **one
week as a list** with a heat-mapped week strip; the timetable as day-by-day
lists with a "next class" flag; and the detail sheet.

The calendar is the real change. The desktop grid is not made narrower on a
phone — it is not drawn at all. Eight columns across 412px is the wrong
artefact rather than a layout problem. What survives is what a grid cell holds:
the course, the day, anything graded, the topic, and the same tick chips keyed
the same way, so a tick made on a phone is a tick made anywhere.

**Four things in the canvas were deliberately not built** (Rafael's call,
27 Sep 2026). Each is something he had removed from the desktop the day before,
and the design predates those decisions:

| In the canvas | Why not |
|---|---|
| A "Deadlines only" filter in the calendar | Removed on 26 Sep — the chapter runs are the reason to open that screen |
| A dashed "dated only to a week" band | Removed on 26 Sep, after the LGL152 midterm got its Friday |
| Upcoming reaching a fortnight ahead | Bounded to the week's five business days on 26 Sep |
| Classes / In person / Online figures on the Timetable | The stats strip came off on 26 Sep |

The canvas also carries its own copy of the term's data for the preview. The
app ignores it entirely and reads `data/*.csv`, as everything here does.
