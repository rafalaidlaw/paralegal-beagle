# -*- coding: utf-8 -*-
"""Put the app's light theme onto a Word document.

    python style_docx.py "syllabi/Immigration ToolKit Raw.docx"
    python style_docx.py "syllabi/Immigration ToolKit Raw.docx" --report
    python style_docx.py "syllabi/Immigration ToolKit Raw.docx" --google

Reads one .docx and writes a styled copy beside it (or to --out). **The input is
never modified** -- the file is called "Raw" and it stays raw, so re-running this
after editing the source is always safe.

This has nothing to do with the app or the website. It is not imported by
serve.py, it writes nothing into data/, and build_static.py names the files it
publishes so a .docx can never reach dist/. It is here rather than in tools/
because tools/ is the interface test suite; this is a document utility, like
extract.py.

WHERE THE STYLING COMES FROM
Every colour is a token read out of app/app.css's light :root block, so the
document and the app cannot drift apart. The choices that needed a decision:

* **Bahnschrift for headings and labels, Segoe UI for body and quotes.** Both
  are in the app's own `--sans` chain, in that order. Bahnschrift is a condensed
  DIN -- excellent for the app's headings, chips and table columns, which is
  what CLAUDE.md means by "grotesque headings", and measurably harder going for
  350 paragraphs of statutory prose on paper. Readability was the ask, so the
  body takes the next face in the same stack rather than a foreign one. Set
  BODY_FACE = HEAD_FACE below for all-Bahnschrift.
* **The accent is LGL225's own hue, not the red.** `--accent` means stakes in
  this project -- an exam, a test, the next graded item -- and a reference
  toolkit has none. `--c-lgl225` (#873993, 6.9:1) is how the app already tells
  Immigration Law apart from the other seven. Red appears in exactly one place:
  the word "Important:", which is Rafael's own flag, and it uses `--accent-text`
  because that is the red allowed to carry words.
* **Verbatim quotations are drawn as quotations** -- indented, ruled down the
  left, in `--ink2` -- following `.md blockquote`. That is the one piece of
  formatting here doing legal work rather than decorative work: on this document
  the line between what the regulation says and what Rafael wrote about it is
  the whole point, and it was invisible in the raw file.

Needs python-docx (pip install python-docx). Word's own styles are left alone
where they are not used; formatting is written directly onto runs rather than
left to inherit, because the raw file carries direct run formatting that would
otherwise win.
"""
import re
import sys
from pathlib import Path

try:
    from docx import Document
    from docx.enum.text import WD_LINE_SPACING
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    from docx.shared import Pt, Inches, RGBColor
except ImportError:
    sys.exit("python-docx is required:\n    pip install python-docx")

ROOT = Path(__file__).resolve().parent

# ---------------------------------------------------------------- the tokens
# Read from app/app.css's light :root so there is one source for the palette.
CSS = (ROOT / "app" / "app.css").read_text(encoding="utf-8")


def token(name, fallback):
    """--ink: #201e1d;  ->  RGBColor(0x20, 0x1e, 0x1d)"""
    m = re.search(rf"^\s*{re.escape(name)}:\s*(#[0-9a-fA-F]{{6}})\s*;", CSS, re.M)
    hexv = (m.group(1) if m else fallback).lstrip("#")
    return RGBColor(int(hexv[0:2], 16), int(hexv[2:4], 16), int(hexv[4:6], 16))


INK = token("--ink", "#201e1d")            # body text, 15.0:1 on white
INK2 = token("--ink2", "#605d5d")          # quoted text, 6.5:1
INK3 = token("--ink3", "#6b6767")          # labels, 5.1:1
RULE = token("--rule", "#bab6b6")          # the 2px rules
ACCENT_TEXT = token("--accent-text", "#ae1800")   # the red allowed on words
COURSE = token("--c-lgl225", "#873993")    # Immigration Law's own hue, 6.9:1

HEAD_FACE = "Bahnschrift"
BODY_FACE = "Segoe UI"
MONO_FACE = "Cascadia Mono"

BODY_PT = 11            # the app's 14px, nudged up for paper
HEAD_PT = 15.5          # the app's h2 at 21px, scaled to the page
LABEL_PT = 9            # the app's .lbl at 12px
QUOTE_PT = 10.5
MONO_PT = 9.5
MARGIN_IN = 1.4         # 6.5in of text is ~90 characters; this is nearer the
                        # app's --measure of 66ch. One number, easily put back.

# The source already separates its questions: 22 of the empty paragraphs are
# Google Docs horizontal lines -- <w:pict><v:rect o:hr="t" fillcolor="#A0A0A0">
# -- which carry no text, so they read as blank until you render the file. The
# app rules a section at its HEAD, tight under the space above it, and that rule
# is drawn here on the heading. Keeping both gave two grey lines with a gap
# between them, which is what the first render showed. So the source's own rules
# come out and the heading's rule stands in for them, in the app's --rule rather
# than Word's default grey. Set this True to keep them and the heading rule is
# dropped instead -- one or the other, never both.
KEEP_SOURCE_RULES = False

# The document's own vocabulary, surveyed from the file rather than assumed.
# A paragraph opening with one of these and a colon is a label.
QUOTE_LABELS = {"Regulation text (copied word for word)",
                "IRCC’s wording (copied word for word)"}
LINK_LABELS = {"Link", "Direct PDF", "Form page (IRCC)", "Start page (IRCC home)",
               "Application package tool", "Current fee amount (IRCC)"}
HOT_LABELS = {"Important"}
LABELS = QUOTE_LABELS | LINK_LABELS | HOT_LABELS | {
    "Where to find it", "Official title on IRCC form page", "Version check",
    "Note", "Toolkit instruction"}

# The colon is NOT consumed here, and the whitespace after it is not
# either. Both belong to Rafael's text. An earlier version matched ":\s*" and
# rebuilt the paragraph as label + "  " + value, which silently deleted every
# colon in the document and changed the spacing of 92 paragraphs -- styling is
# allowed to change how text looks and never what it says.
LABEL_RE = re.compile(r"^(" + "|".join(sorted(map(re.escape, LABELS), key=len, reverse=True)) + r"):")
URL_RE = re.compile(r"https?://\S+")
# A label this file does not yet use. "Complete Guide (IMM 5289): https://..." is
# one of these, and a form number inside a label is exactly the sort of thing
# that changes when IRCC reissues a form -- so the SHAPE is matched rather than
# the words. Deliberately narrow: a short capitalised run, a colon, and a URL in
# what follows. Anything looser would style the opening clause of a sentence.
MAYBE_LABEL_RE = re.compile(r"^([A-Z][^:]{1,45}):")


def label_of(text):
    """(label_including_its_colon, rest) if this is a label, else None.

    `rest` keeps the original spacing after the colon, so label + rest is the
    paragraph's text unchanged."""
    m = LABEL_RE.match(text)
    if m:
        return m.group(0), text[m.end():]
    m = MAYBE_LABEL_RE.match(text)
    if m and URL_RE.search(text[m.end():]):
        return m.group(0), text[m.end():]
    return None


# ------------------------------------------------------------ xml helpers
# w:rPr's children are an ordered sequence too. These are the siblings that must
# follow w:caps and w:spacing respectively.
AFTER_CAPS = ("smallCaps", "strike", "dstrike", "outline", "shadow", "emboss",
              "imprint", "noProof", "snapToGrid", "vanish", "webHidden", "color",
              "spacing", "w", "kern", "position", "sz", "szCs", "highlight", "u",
              "effect", "bdr", "shd", "fitText", "vertAlign", "rtl", "cs", "em",
              "lang", "eastAsianLayout", "specVanish", "oMath")
AFTER_CHAR_SPACING = AFTER_CAPS[AFTER_CAPS.index("w"):]


def set_caps(run):
    """Word's real caps property. Unlike CSS text-transform this is a DISPLAY
    property -- the underlying text keeps its own case, so copying a citation out
    of the document still gives you exactly what Rafael typed."""
    insert_ordered(run._element.get_or_add_rPr(), OxmlElement("w:caps"), AFTER_CAPS)


def set_tracking(run, twentieths):
    """Letter-spacing, in twentieths of a point. The app tracks .lbl at .1em and
    h2 at -.02em."""
    el = OxmlElement("w:spacing")
    el.set(qn("w:val"), str(int(twentieths)))
    insert_ordered(run._element.get_or_add_rPr(), el, AFTER_CHAR_SPACING)


# w:pPr's children are an ORDERED sequence in the OOXML schema, and so are
# w:pBdr's. Appending w:pBdr to the end of w:pPr -- after w:spacing, w:ind and
# w:rPr -- produces a file Word will open but does not lay out as written: the
# first version of this script did that and Word drew a second horizontal rule
# between every section. These are the siblings that must follow w:pBdr.
AFTER_PBDR = ("shd", "tabs", "suppressAutoHyphens", "kinsoku", "wordWrap",
              "overflowPunct", "topLinePunct", "autoSpaceDE", "autoSpaceDN",
              "bidi", "adjustRightInd", "snapToGrid", "spacing", "ind",
              "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc",
              "textDirection", "textAlignment", "textboxTightWrap", "outlineLvl",
              "divId", "cnfStyle", "rPr", "sectPr", "pPrChange")
PBDR_ORDER = ("top", "left", "bottom", "right", "between", "bar")


def insert_ordered(parent, child, must_follow):
    """Put `child` before the first sibling whose tag is in `must_follow`."""
    for i, existing in enumerate(parent):
        if existing.tag.split("}")[1] in must_follow:
            parent.insert(i, child)
            return child
    parent.append(child)
    return child


def set_border(par, edge, pt, color, space=0):
    pPr = par._p.get_or_add_pPr()
    bdr = pPr.find(qn("w:pBdr"))
    if bdr is None:
        bdr = insert_ordered(pPr, OxmlElement("w:pBdr"), AFTER_PBDR)
    e = OxmlElement(f"w:{edge}")
    e.set(qn("w:val"), "single")
    e.set(qn("w:sz"), str(int(pt * 8)))      # eighths of a point
    e.set(qn("w:space"), str(int(space)))
    e.set(qn("w:color"), str(color))
    insert_ordered(bdr, e, PBDR_ORDER[PBDR_ORDER.index(edge) + 1:])


def face(run, name, size_pt, color, bold=False):
    run.font.name = name
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = False
    run.font.color.rgb = color
    # python-docx sets w:ascii and w:hAnsi; eastAsia is set too or Word may
    # substitute a fallback face for the curly quotes and em dashes.
    rPr = run._element.get_or_add_rPr()
    rf = rPr.find(qn("w:rFonts"))
    if rf is None:
        rf = OxmlElement("w:rFonts")
        rPr.append(rf)
    for a in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rf.set(qn(a), name)


# ------------------------------------------------- runs, hyperlinks included
# 33 of the Link: paragraphs hold REAL Word hyperlinks (66 w:hyperlink elements),
# and a hyperlink's runs are children of w:hyperlink, not of w:p. python-docx's
# Paragraph.runs does not see them but Paragraph.text does -- so rebuilding a
# paragraph from its .text and writing it into .runs[0] left the hyperlink in
# place and printed every URL twice. Nothing here rebuilds text: existing runs
# are restyled where they sit, which preserves the links as links so Rafael can
# still click through to the regulation.
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def run_items(par):
    """[(w:r element, inside_a_hyperlink)] in document order, nesting included."""
    out = []
    for child in par._p:
        if child.tag == W + "r":
            out.append((child, False))
        elif child.tag == W + "hyperlink":
            for r in child.findall(qn("w:r")):
                out.append((r, True))
    return out


def el_text(r):
    return "".join(t.text or "" for t in r.findall(qn("w:t")))


def set_el_text(r, text):
    """Collapse the run's w:t children to one, preserving significant spaces."""
    for t in r.findall(qn("w:t")):
        r.remove(t)
    t = OxmlElement("w:t")
    t.text = text
    t.set(qn("xml:space"), "preserve")
    # w:t must follow w:rPr; appending is correct because rPr is written first.
    r.append(t)


def split_run(r, k):
    """Split one run after k characters, returning the new second run. Used only
    when a label's colon falls inside a run rather than at its end."""
    import copy
    text = el_text(r)
    new = copy.deepcopy(r)
    set_el_text(r, text[:k])
    set_el_text(new, text[k:])
    r.getparent().insert(list(r.getparent()).index(r) + 1, new)
    return new


def clear_rPr(r):
    """Drop direct formatting before writing new formatting. The raw file sets
    13pt on every heading run directly, and direct formatting beats a style; on a
    hyperlink run this also drops the Hyperlink character style, which is what
    made the URLs blue and underlined."""
    rPr = r.find(qn("w:rPr"))
    if rPr is not None:
        r.remove(rPr)


def wrap(r, par):
    from docx.text.run import Run
    return Run(r, par)


def style_run(r, par, name, size_pt, color, bold=False, caps=False, track=None):
    clear_rPr(r)
    run = wrap(r, par)
    face(run, name, size_pt, color, bold=bold)
    if caps:
        set_caps(run)
    if track is not None:
        set_tracking(run, track)


# ------------------------------------------------------------- the classifier
def classify(paragraphs):
    """One role per paragraph. A label resets the quote state, so Rafael's own
    'Note:' or 'Important:' after a quotation is never drawn as quoted text."""
    roles, in_quote = [], False
    for p in paragraphs:
        t = p.text.strip()
        if p.style.name == "Heading 2":
            roles.append("head")
            in_quote = False
        elif not t:
            roles.append("blank")          # may sit inside a quote; state holds
        elif label_of(t):
            lab, _ = label_of(t)
            roles.append("label")
            in_quote = lab.rstrip(":") in QUOTE_LABELS
        else:
            roles.append("quote" if in_quote else "body")
    return roles


def report(doc):
    ps = doc.paragraphs
    roles = classify(ps)
    from collections import Counter
    print("roles:", dict(Counter(roles)))
    print("\nEvery transition, so a mis-classified block is visible:\n")
    for i, (p, r) in enumerate(zip(ps, roles)):
        if r == "blank":
            continue
        prev = next((x for x in reversed(roles[:i]) if x != "blank"), None)
        if r != prev:
            print(f"  [{i:3}] {r:6} | {p.text.strip()[:78]}")
    inferred = [p.text.strip()[:70] for p, r in zip(ps, roles)
                if r == "label" and not LABEL_RE.match(p.text.strip())]
    if inferred:
        print("\nStyled as a label by SHAPE, not by name (prefix + colon + URL):")
        for u in inferred:
            print("   ", u)
    unknown = [p.text.strip()[:70] for p, r in zip(ps, roles)
               if r == "body" and re.match(r"^[A-Z][^:]{1,45}:", p.text.strip())]
    if unknown:
        print("\nLooks like a label but left as body -- no URL after the colon:")
        for u in unknown:
            print("   ", u)


# ------------------------------------------------------------------ the styling
def style(doc):
    for s in doc.sections:
        s.left_margin = Inches(MARGIN_IN)
        s.right_margin = Inches(MARGIN_IN)

    ps = doc.paragraphs
    roles = classify(ps)

    for par, role in zip(ps, roles):
        pf = par.paragraph_format

        if role == "head":
            # The app's ruled sections: a 2px rule, then the heading under it.
            for r, _ in run_items(par):
                style_run(r, par, HEAD_FACE, HEAD_PT, INK, bold=True, track=-6)
            pf.space_before, pf.space_after = Pt(20), Pt(7)
            pf.line_spacing_rule = WD_LINE_SPACING.SINGLE
            pf.keep_with_next = True                 # never alone at a page foot
            pf.left_indent = Inches(0)
            if not KEEP_SOURCE_RULES:
                set_border(par, "top", 2, RULE, space=10)

        elif role == "label":
            lab, rest = label_of(par.text.strip())
            hot = lab.rstrip(":") in HOT_LABELS
            # Find the run the label ends in and split it there, so a paragraph
            # whose label and value share one run still styles correctly.
            items = run_items(par)
            at, boundary = 0, len(lab)
            for r, _ in list(items):
                n = len(el_text(r))
                if at < boundary < at + n:
                    split_run(r, boundary - at)
                    items = run_items(par)           # re-read: a run was added
                    break
                at += n
            at = 0
            for r, in_link in items:
                n = len(el_text(r))
                if at < boundary:
                    style_run(r, par, HEAD_FACE, LABEL_PT,
                              ACCENT_TEXT if hot else INK3,
                              bold=True, caps=True, track=18)   # .lbl at .1em
                elif in_link:
                    # A URL goes mono and smaller so a 90-character link cannot
                    # dominate the page. It stays a working hyperlink.
                    style_run(r, par, MONO_FACE, MONO_PT, COURSE)
                else:
                    style_run(r, par, BODY_FACE, BODY_PT, INK)
                at += n
            pf.space_before = Pt(10 if rest.strip() else 12)
            pf.space_after = Pt(2 if rest.strip() else 4)
            pf.line_spacing = 1.35
            pf.keep_with_next = True
            pf.left_indent = Inches(0)

        elif role == "quote":
            # .md blockquote: ruled down the left, indented, --ink2.
            for r, in_link in run_items(par):
                if in_link:
                    style_run(r, par, MONO_FACE, MONO_PT, COURSE)
                else:
                    style_run(r, par, BODY_FACE, QUOTE_PT, INK2)
            pf.left_indent = Inches(0.24)
            pf.space_before, pf.space_after = Pt(0), Pt(5)
            pf.line_spacing = 1.4
            set_border(par, "left", 3, RULE, space=8)

        elif role == "body":
            # His own words, in the strongest ink on the page -- darker than the
            # regulation he is quoting, which is the right way round.
            for r, in_link in run_items(par):
                if in_link:
                    style_run(r, par, MONO_FACE, MONO_PT, COURSE)
                else:
                    style_run(r, par, BODY_FACE, BODY_PT, INK)
            pf.space_before, pf.space_after = Pt(0), Pt(6)
            pf.line_spacing = 1.5
            pf.left_indent = Inches(0)

        else:                                        # blank, or a source rule
            for r, _ in run_items(par):
                if r.find(qn("w:pict")) is not None:
                    if not KEEP_SOURCE_RULES:
                        r.getparent().remove(r)      # see KEEP_SOURCE_RULES
                    continue                         # never restyle a drawing
                style_run(r, par, BODY_FACE, BODY_PT, INK)
            pf.space_before, pf.space_after = Pt(0), Pt(0)
            pf.line_spacing = 1.0

        pf.widow_control = True


def use_google_faces():
    """--google: the same design, in faces Google Docs actually has.

    Bahnschrift, Segoe UI and Cascadia Mono ship with Windows and mean nothing
    in Docs, which would silently fall back to Arial and lose the look entirely.

    ARCHIVO is not a compromise here, it is the original: the app was designed
    in Archivo and only uses Bahnschrift because the app is offline and Archivo
    is a Google Font (see reference/claude-design/). In Docs that constraint is
    gone, so the document gets the face the design was actually drawn in -- and
    one face serves throughout, as `--sans` does in the app, because Archivo is
    a normal-width grotesque rather than a condensed DIN and reads perfectly
    well over 26 pages. Roboto Mono replaces Cascadia Mono for the URLs.

    Two properties do NOT survive a Docs import, and nothing can be done about
    it from this end: `w:caps`, which is what draws the labels in capitals, and
    character tracking. Both are display-only, so the text is unaffected either
    way -- the labels stay bold, grey and small, which is still legible as a
    label, and LABEL_PT is nudged up a little to carry that weight without the
    capitals doing it. The one thing NOT done is uppercasing the text itself to
    fake it: that would change what the document says, which is the line this
    script does not cross.
    """
    global HEAD_FACE, BODY_FACE, MONO_FACE, LABEL_PT
    HEAD_FACE = BODY_FACE = "Archivo"
    MONO_FACE = "Roboto Mono"
    LABEL_PT = 9.5


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        sys.exit(__doc__)
    src = Path(argv[0])
    if not src.is_absolute():
        src = ROOT / src
    if not src.exists():
        sys.exit(f"no such file: {src}")

    google = "--google" in argv
    doc = Document(str(src))
    if "--report" in argv:
        report(doc)
        return 0

    out = None
    if "--out" in argv:
        out = Path(argv[argv.index("--out") + 1])
        if not out.is_absolute():
            out = ROOT / out
    else:
        stem = src.stem.replace(" Raw", "").strip()
        out = src.with_name(stem + (" - styled (Google Docs).docx" if google
                                    else " - styled.docx"))

    if google:
        use_google_faces()
    style(doc)
    out.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(out))
    print(f"wrote {out.relative_to(ROOT)}")
    print(f"  {src.name} was not modified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
