# -*- coding: utf-8 -*-
"""WCAG 2.1 contrast for the palette that actually ships.

Run after changing any colour:   python tools/contrast.py

It PARSES app/app.css rather than holding its own copy of the palette. An
earlier version hardcoded the hexes and was reporting two colours that had
already been changed — a checker that can disagree with the stylesheet is
worse than no checker.

Rules it enforces:
  * anything carrying content clears 4.5:1
  * --ink4 is decorative only (dashes, rules, disabled glyphs) and is
    expected to fail; it is reported separately, not as an error
  * --accent-text is the only red that may carry words: 4.5:1 everywhere
  * --accent is a mark (rails, bars, >=22px bold numbers): 3:1 is its floor,
    and in light mode it measures ~3.8 on the page, so it never carries text
  * a course hue must clear 4.5:1 on --surf and --surf2
"""
import io
import itertools
import re
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

CSS = Path(__file__).resolve().parent.parent / "app" / "app.css"

# ----------------------------------------------------------------- colour maths
def srgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))

def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def lum(h):
    r, g, b = (lin(x) for x in srgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def cr(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

def mix(a, b, pct):
    """Approximates color-mix(a pct, b). oklab differs slightly; srgb is the
    conservative reading for a legibility floor."""
    ca, cb, p = srgb(a), srgb(b), pct / 100
    return "#" + "".join(f"{round((ca[i] * p + cb[i] * (1 - p)) * 255):02x}" for i in range(3))

# ----------------------------------------------------------------- parse the css
def block(css, selector):
    """The declarations of the FIRST rule whose selector line matches."""
    i = css.find(selector)
    if i < 0:
        return {}
    start = css.index("{", i)
    depth, j = 0, start
    while j < len(css):
        if css[j] == "{":
            depth += 1
        elif css[j] == "}":
            depth -= 1
            if depth == 0:
                break
        j += 1
    body = css[start + 1:j]
    return dict(re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", body))

def clean(v):
    return v.split("/*")[0].strip()

css = CSS.read_text(encoding="utf-8")
# Comments first: a note like "3.8 on --bg: marks only" reads as a declaration
# and swallows the one after it. It silently dropped --accent-text once.
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
light = {k: clean(v) for k, v in block(css, ":root {").items()}
dark = {k: clean(v) for k, v in block(css, ':root[data-theme="dark"]').items()}

def resolve(palette, key, seen=None):
    """Follow var(--x) chains; fall back to the light value like the cascade."""
    seen = seen or set()
    if key in seen:
        return None
    seen.add(key)
    v = palette.get(key, light.get(key))
    if v is None:
        return None
    m = re.fullmatch(r"var\((--[\w-]+)\)", v)
    if m:
        return resolve(palette, m.group(1), seen)
    return v if v.startswith("#") else None

HUES = ["--c-lgl151", "--c-lgl152", "--c-lgl153", "--c-lgl154",
        "--c-lgl156", "--c-lgl160", "--c-lgl225", "--c-lgl250"]
SURFACES = ["--bg", "--surf", "--surf2", "--surf3"]
CONTENT_INKS = ["--ink", "--ink2", "--ink3"]
TEXT_ACCENTS = ["--accent-text"]      # the only red that may carry words
MARK_ACCENTS = ["--accent"]           # bright red: rails, bars, >=22px numbers; 3:1 floor

problems = []

def report(name, palette):
    P = {k: resolve(palette, k) for k in
         SURFACES + CONTENT_INKS + ["--ink4"] + TEXT_ACCENTS + MARK_ACCENTS + HUES}

    print("\n" + "=" * 76 + "\n" + name + "\n" + "=" * 76)

    print("content ink on each surface — all must clear 4.5")
    for ink in CONTENT_INKS:
        row = f"  {ink:<14}"
        for s in SURFACES:
            v = cr(P[ink], P[s])
            row += f"  {s[2:]}={v:5.2f}{'' if v >= 4.5 else '  FAIL'}"
            if v < 4.5:
                problems.append(f"{name}: {ink} on {s} is {v:.2f}")
        print(row)

    row = "  --ink4        "
    for s in SURFACES:
        row += f"  {s[2:]}={cr(P['--ink4'], P[s]):5.2f}"
    print(row + "   (decorative only — expected to fail, never put content in it)")

    print("the accent as TEXT — must clear 4.5 on every surface")
    for k in TEXT_ACCENTS:
        row = f"  {k:<14}"
        for s in SURFACES:
            v = cr(P[k], P[s])
            row += f"  {s[2:]}={v:5.2f}{'' if v >= 4.5 else '  FAIL'}"
            if v < 4.5:
                problems.append(f"{name}: {k} on {s} is {v:.2f}")
        print(row)

    print("the accent as a MARK (rails, bars, >=22px bold numbers) — 3.0 is the floor")
    for k in MARK_ACCENTS:
        row = f"  {k:<14}"
        for s in SURFACES:
            v = cr(P[k], P[s])
            row += f"  {s[2:]}={v:5.2f}{'' if v >= 3.0 else '  FAIL'}"
            if v < 3.0:
                problems.append(f"{name}: {k} as a mark on {s} is {v:.2f}")
        print(row)
    print("  (body-size words never go in --accent; that is what --accent-text is for)")

    print("course hues as text or marks")
    for k in HUES:
        a, b = cr(P[k], P["--surf"]), cr(P[k], P["--surf2"])
        acc = cr(P[k], P["--accent"])
        flag = "" if min(a, b) >= 4.5 else "  FAIL"
        print(f"  {k[2:]:<9} {P[k]}  surf={a:5.2f} surf2={b:5.2f}{flag}   vs accent={acc:4.2f}")
        if min(a, b) < 4.5:
            problems.append(f"{name}: {k} is {min(a, b):.2f} on a panel")
    worst = min((cr(P[a], P[b]), a, b) for a, b in itertools.combinations(HUES, 2))
    print(f"  closest hue pair by luminance: {worst[1][2:]} vs {worst[2][2:]} = {worst[0]:.2f}")
    print("  (hues are close in luminance by design — the mono course code always")
    print("   sits beside the mark, and forced-colors drops the tint entirely)")

report("LIGHT", light)
report("DARK   (primary — Rafael's machine is in dark mode)", dark)

print(f"\n{'=' * 76}")
if problems:
    print(f"{len(problems)} problem(s):")
    for p in problems:
        print("  " + p)
    sys.exit(1)
print("PASS: everything carrying content clears 4.5:1 in both themes")
