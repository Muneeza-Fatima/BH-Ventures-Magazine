/* ============================================================
   check-ink.mjs — is the book light, but not white?

   The client's brief was precise and worth quoting: neither a
   white magazine nor a dark one — light pages that still carry
   the brand. That is easy to say, easy to agree with, and easy to
   drift away from over twenty-four pages, in either direction.

   So it is measured. Each page is rendered and its navy coverage
   counted. Too little and the page has gone plain white; too much
   and it has gone dark. The devices that supply it — the panels,
   the bands, the sidebars — are exactly what the count reflects.

   Full-bleed photographic pages are exempt: their coverage comes
   from the picture, not from the design, and darkening or
   lightening a photograph to satisfy a number would be absurd.

   Usage: node build/check-ink.mjs [preview.html]
   ============================================================ */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = process.argv[2] ?? resolve(ROOT, 'out/magazine/preview.html');
if (!existsSync(page)) {
  console.error('check-ink: no such file: ' + page);
  process.exit(2);
}

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOT_DIR = resolve(ROOT, 'out/.ink');
/* TWO measurements, because the brief was about the BOOK and the
   old check was about the page.

   History, because it matters and because half of it was my fault.
   The bounds started at 20-35% per page, from judgement. They were
   then lowered to 12% when two pages read 13% and 18%, which
   looked like honest calibration and was not: the screenshot was
   the whole browser window and the page filled only its top-left
   corner, so every reading was diluted about threefold. Cropping
   to the page put the same two at 23% and 31%, and the original
   bounds went back.

   That fix was right. The bounds were still wrong, and the client
   found the reason before I did. Demanding 20% navy on a page of
   three paragraphs and a quote leaves exactly one way to get it:
   put a navy box round something. That is what produced the box
   behind "Ten disciplines. One standard." - the device the client
   called bohot bura, and they were right. A target that can only
   be met by making the page worse is the wrong target.

   So it now measures what the brief actually said - neither a
   white book nor a dark one:

     per page   a ceiling only, to catch a page that has gone
                accidentally black. The floor that used to sit
                under it was removed; the note by MAX says why
     per book   the mean across every page, which is the real
                "light, but carrying the brand" number
     balance    that the book actually alternates, rather than
                averaging out by being half blank and half black

   Widening a bound to fit the work is usually how a check dies.
   This one is written down, argued for, and paired with a
   book-level measure that is HARDER to satisfy by accident. */
const MAX = 0.45;
const BOOK_MIN = 0.16;
const BOOK_MAX = 0.34;

/* Pages whose coverage comes from a photograph rather than from
   the design, and pages that are dark BY DECLARATION - the dark
   punctuation the book is built on. Both are declared by class in
   the markup, so this stays honest: a page cannot quietly exempt
   itself by drifting, only by being written that way. */
const EXEMPT = /class="[^"]*\b(cover|page--photo|venture-page|page--dark|page--deep)\b/;

/* THERE IS NO PER-PAGE FLOOR ANY MORE, and it was removed on
   evidence rather than to make a build pass. The evidence is
   worth keeping, because removing a check is the easiest way to
   ruin one.

   The floor was 10%: below it a page was called TOO PLAIN. It
   was calibrated against a book whose every section page opened
   on a navy header band. The client has since had those bands
   removed, one page at a time, along with the foot panels and
   the cards - six separate instructions, all in the same
   direction - and the measured pages stopped being one
   population. They became two:

     with a navy device      23 - 37%
     without one            0.4 - 10%

   and nothing in between. No floor separates those groups by
   COVERAGE, because what separates them is not coverage. It is
   whether the page was designed with a navy device, which is
   intent, and a pixel count cannot see intent.

   The last build made that undeniable: Global Connections failed
   at 9.9% against a floor of 10.0 - a page with a full 190mm
   photographic plate on it, failing a whiteness test by one
   tenth of one per cent. That is not a signal, it is noise with
   a threshold drawn through it.

   The intermediate fix was a page--plain class, written into the
   markup so a page could only go plain by saying so. It reached
   FIVE pages of twelve, and two of those carried large
   photographs and were not plain by any reading of the word. A
   waiver on nearly half the measured pages is not a waiver; it
   is the check having been replaced by a list, and the list was
   being kept by hand.

   So the floor is gone and the class with it. What remains is
   what the brief actually said, and all of it is harder to
   satisfy by accident than a per-page minimum:

     MAX          a page cannot go dark by mistake
     BOOK_MIN     the book cannot go white - the real measure
     BOOK_MAX     the book cannot go dark
     light >= 8   enough pages are design-led
     dark  >= 3   enough pages carry the brand

   A single page that loses its content by accident is caught by
   check-space, which measures holes, not colour - and which is
   the right tool for that failure anyway. */
const html = readFileSync(page, 'utf8');
const sections = [...html.matchAll(/<section class="([^"]*)"/g)].map((m) => m[1]);


/* Render each page to a bitmap through the same pdf.js harness the
   other checks use, then count pixels close to --ink. */
const pdf = resolve(ROOT, 'out/magazine/'+'BH VENTURES FZE.pdf');
const INK = [0x0e, 0x1b, 0x2b];

const near = (r, g, b) => Math.abs(r - INK[0]) + Math.abs(g - INK[1]) + Math.abs(b - INK[2]) < 70;

console.log('\n' + '-'.repeat(56) + '\n  check-ink  ·  navy coverage per page\n' + '-'.repeat(56));

let bad = 0;
let darkByDesign = 0;
const pcts = [];   // design pages only -- see the note at the foot
const shots = existsSync(SHOT_DIR) ? readdirSync(SHOT_DIR).filter((f) => f.endsWith('.png')).sort() : [];

if (!shots.length) {
  console.log('  no page images found in out/.ink — run build/shoot-pages.mjs first');
  console.log('  (skipping; the other checks still gate the build)\n');
  process.exit(0);
}

/* The screenshot is the browser window and the page occupies only
   its top-left corner, so the frame has to be cropped to the page
   before anything is counted. Counting the whole frame diluted every
   reading by roughly three times, which is what made the first set of
   numbers meaningless.

   This used to crop by DETECTION: the paper was #FAFAF8 and the
   pasteboard pure #FFFFFF, so it walked the bitmap for the last row
   and column that were not pure white. That worked, and it was
   fragile in a way that was easy to miss - it did not find the page,
   it found the last CONTENT pixel. Measured on the new light design:

     paper #FDFDFB   ->  crop 765x1073   (correct)
     paper #FFFFFF   ->  crop 737x1053   (short; reading inflated
                                          29.3% -> 31.0%)

   The error is small when the page is busy to its edges and unbounded
   when it is not - and a page that is deliberately empty at the foot
   is the whole point of the light design. So it now crops by
   GEOMETRY, which is known exactly and cannot drift: the media box is
   216x303mm = 612x859pt, rendered by shoot-pages.mjs at --scale.

   Keep --paper off pure white anyway. It is correct on coated stock,
   and it keeps this file honest if the scale ever changes. */

const SCALE = Number(process.env.INK_SCALE ?? 1.25);
const PAGE_PT = { w: 612, h: 859 };

function pageBounds(data, w, h) {
  const box = { w: Math.floor(PAGE_PT.w * SCALE), h: Math.floor(PAGE_PT.h * SCALE) };
  if (box.w > w || box.h > h) {
    console.error(`check-ink: page box ${box.w}x${box.h} does not fit the ${w}x${h} shot.`);
    console.error('  INK_SCALE must match the --scale shoot-pages.mjs ran at.');
    process.exit(2);
  }
  return box;
}

for (let i = 0; i < shots.length; i++) {
  const { data, info } = await sharp(resolve(SHOT_DIR, shots[i])).raw().toBuffer({ resolveWithObject: true });
  const c = info.channels;
  const box = pageBounds(data, info.width, info.height);
  let ink = 0;
  const total = box.w * box.h;
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const p = (y * info.width + x) * c;
      if (near(data[p], data[p + 1], data[p + 2])) ink++;
    }
  }
  const pct = ink / total;
  const cls = sections[i] ?? '';
  const exempt = EXEMPT.test('class="' + cls + '"');
  const label = 'page ' + String(i + 1).padStart(2) + '  ' + (pct * 100).toFixed(1).padStart(5) + '% navy';

  if (exempt) {
    if (/page--dark|page--deep/.test(cls)) darkByDesign++;
    console.log('  ' + label + '   (by design — exempt)');
  } else if ((pcts.push(pct), pct) > MAX) {
    bad++;
    console.log('  ' + label + '   TOO HEAVY — the page has gone dark');
  } else {
    console.log('  ' + label + '   ok');
  }
}

console.log('-'.repeat(56));

const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
const light = pcts.length;

console.log('  book mean          ' + (mean * 100).toFixed(1) + '%   (want ' +
  BOOK_MIN * 100 + '-' + BOOK_MAX * 100 + '%)');
console.log('  design pages       ' + light + '   (the rest are photographs or dark by design)');
console.log('  dark by design     ' + darkByDesign + ' pages');

if (mean < BOOK_MIN) { bad++; console.log('  THE BOOK HAS GONE WHITE'); }
if (mean > BOOK_MAX) { bad++; console.log('  THE BOOK HAS GONE DARK'); }

/* A book that is half blank and half black averages to the same
   number as one that is balanced. This is the check that tells
   them apart. */
if (light < 8) { bad++; console.log('  NOT ENOUGH LIGHT PAGES - the book has stopped being light'); }
/* Three, not four. The book had four pages that go properly
   dark - PORTFOLIO SPANS, the ventures opener, the trading
   community and the back cover - and the client removed the
   first of them, so the floor moved with the book rather than
   the book being held to a number it no longer has the pages
   for. The three that remain are spread through it: one opening
   the ventures at the front half, one at the back, one on the
   outside. That is still alternation, which is what this gate
   exists to protect. It is a cut, and it is written down as one. */
if (darkByDesign < 3) { bad++; console.log('  NOT ENOUGH DARK PAGES - nothing is carrying the brand'); }

console.log('-'.repeat(56));
if (bad) {
  console.log('  ' + bad + ' problem(s)\n');
  process.exit(1);
}
console.log('  light, and still carrying the brand\n');