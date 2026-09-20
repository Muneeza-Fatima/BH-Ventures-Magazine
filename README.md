# BH Ventures FZE LLC — Magazine, Edition 01

A print-ready corporate magazine, built as HTML and exported to PDF. No InDesign
required: the layout lives in CSS, the words live in one JSON file, and the whole
thing rebuilds with a single command.

Current state: **a 7-page design sample** for client approval. The full 16-page
magazine follows once the direction is signed off.

---

## Quick start

```bash
npm install          # sharp, for image grading
npm run build        # HTML -> PDF -> both checks
```

Output lands in `out/sample/`:

| File | What it is |
| --- | --- |
| `BH-Ventures-SAMPLE.pdf` | 7 pages, 216 × 303 mm (A4 + 3 mm bleed), fonts embedded |
| `preview.html` | the same pages in a browser, no PDF reader needed |

> **Run the PDF step outside Claude Code's tool sandbox.** The sandbox blocks
> Chrome's font rendering on this machine: headless Chrome still draws
> backgrounds and images but renders **no text at all**, so the PDF comes out
> silently wordless. Everything else is happy inside the sandbox.

---

## Changing the words

Every sentence in the magazine is in **`content/copy.json`**. Nothing else needs
touching — not the HTML, not the CSS.

```bash
# edit content/copy.json, then:
npm run build
```

The build refuses to be quiet about unfinished copy. Any `[X]` placeholder still
in the file is reported on every single run:

```
!  4 unresolved placeholder(s) in copy.json: [X]+  [X]h  [X]K+  [X]K+
!  These must be filled with real figures before this goes to a printer.
```

Those four are the §08 "Proof" figures. The client's own draft says *"Confirm
real numbers with the client before print"* — so they are designed as visible
slots rather than quietly set to zero.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | The whole chain: HTML, PDF, fit check, PDF check |
| `npm run html` | `copy.json` + templates → `out/sample/preview.html` |
| `npm run pdf` | `preview.html` → PDF via headless Chrome |
| `npm run check:fit` | Measures every page; fails if content runs under the folio |
| `npm run check:pdf` | Page size, page count, transparency, embedded fonts |
| `npm run images:fetch` | Sources photography (CC0 / CC BY only) + writes `CREDITS.md` |
| `npm run images:grade` | Bakes the colour grade, and cleans the logo assets |
| `npm run map` | Regenerates the network diagram |
| `node build/fetch-fonts.mjs` | Re-downloads the static font instances |

---

## Why it is built this way

Four decisions were forced by things that went wrong in the reference PDF the
client supplied, or in the first proofs of this one. Each has a guard so it
cannot come back.

### 1. The page really is A4

The reference PDF was **793 × 1122 pt**, not A4's 595 × 842. The ratio was
exactly 96/72 — its HTML pixels had been exported as points. A printer would
have shrunk everything by a third, or printed at an odd size.

`build/verify-pdf.mjs` asserts the media box in **points** after every render.

### 2. No live transparency

The reference PDF carried **44 `/Luminosity` soft masks** and 504 transparency
groups, because its photo grading was done with CSS blend modes. Rendered
through pdf.js the hero photos came out hot pink and two pages lost their text
entirely — and **pdf.js is Firefox's built-in PDF viewer**, so that is what a
real reader would have seen.

So all image grading is **baked into the JPEG** by `build/grade-images.mjs`
(sharp), never done with CSS. The checker fails the build on any luminosity mask
or non-normal blend mode.

### 3. Static fonts, not variable

Chrome embeds a **variable** font as a **Type 3** font — glyphs as little
drawing programs instead of a real embedded typeface. It looks right on screen,
but Type 3 is not permitted in PDF/X-4 and prepress RIPs reject or rasterise it.

Measured both ways on this project: variable gave `Type3: 1, FontFile2: 0`;
pinning every axis in the Google Fonts request gives `Type3: 0, FontFile2: 1`.

Because static instances cannot carry a variation axis, Fraunces' optical size —
the reason it was chosen — is baked into three separate families instead:
**Fraunces 144** for display, **72** for section headings and figures, **36** for
pull-quotes and small italic. The checker now fails on any Type 3 font.

### 4. Nothing runs under the folio

`.page` has `overflow: hidden`, so a page that is too long clips silently at the
paper edge rather than at the margin — invisible in the HTML, obvious only once
it is printed. `build/check-fit.mjs` measures every page in the browser and
reports the clearance:

```
page 1  clear by 9.0mm
page 4  clear by 0.0mm      <- full-bleed cover, expected
```

---

## Layout

```
brand/
  tokens.css            palette, type scale, page geometry - the single source
  logo-navy.jpg         supplied, navy background
  logo-transparent.png  supplied
  logo-mark.png         generated: the supplied PNG has a 3px opaque frame
                        baked into it, which renders as a faint rectangle
                        around the mark on a photograph
  logo-monogram.png     generated: mark only, for watermarks that bleed off
                        the page (a half-cut wordmark reads as a misprint)

content/copy.json       every word, verbatim from the client draft

src/
  fonts.css             @font-face, static instances
  print.css             page box, bleed, grid, datum line, folio, recto/verso
  components.css        kickers, sheet numerals, pull-quotes, stats, cards, icons
  sample.html           the seven pages
  sample.css            layout for the presentation pages only

assets/
  fonts/                self-hosted woff2
  images/raw/           downloaded originals, untouched
  images/graded/        what the pages actually use, grade baked in
  graphics/
    icons.svg           ten venture icons, one 24px grid, one stroke weight
    network-map.svg     generated by build/make-map.mjs

build/                  see the command table above
out/sample/             the deliverables
CREDITS.md              photographer, licence and source for every image
```

---

## Photography

Every image is **CC0, Public Domain or CC BY** — licences that permit commercial
use *and* derivative works, since each photo is cropped and colour graded.
CC BY-SA, CC BY-ND and CC BY-NC are excluded on purpose; the reasoning is in
`build/fetch-images.mjs`.

The grade is deliberately light. Photographs stay photographs: Dubai's night
sky keeps its real blue, the containers keep their colours. Two treatments only:

- **Grade R** — full colour, just enough normalisation that photos from
  different sources read as one commission.
- **Grade S** — Grade R plus a navy scrim over **only** the band where type
  sits, so the picture is darkened where the words need it and nowhere else.

**Open item.** Only four images cleared both the licence filter and the quality
bar, and the full magazine needs about ten. The free-licence pool is thin for
modern commercial subjects. See the handover notes for the options.

---

## Before this goes to a printer

1. **§04 says "Nine services" but the draft lists ten ventures**, and §02 and §06
   both say "ten disciplines". One word in `copy.json`.
2. **The four §08 figures** are still `[X]`. The build warns on every run.
3. **Confirm `info@bhventures.ae` and `bhventures.ae`** are live.
4. **Trade licence number** for the colophon, if it should appear.
5. **Page count must be a multiple of 4** for saddle-stitch. The magazine is
   planned at 16. `npm run check:pdf -- --stitched` enforces it.
6. **Convert to CMYK** (FOGRA39 / ISO Coated v2) and use a rich black for the
   navy — **C 90 · M 75 · Y 45 · K 70**, which lands at 280% total ink, inside
   the 300% sheet-fed limit. Flat K-only navy prints patchy.
7. **Aqua `#2DD4C0` dulls in CMYK.** Either accept it, or run it as Pantone
   3255 C — a fifth colour, more money, exact on press.
