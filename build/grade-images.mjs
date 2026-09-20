/* ============================================================
   grade-images.mjs — bake the photography.

   THE RULE: photographs stay photographs. Dubai's sunset stays
   orange, the containers keep their colours, golden hour stays
   golden. Warmth and variety in this magazine come from the
   pictures, not from the palette.

   So there is no duotone here and no recolouring. There are only
   two grades:

     R  Realistic. Full colour. Just enough normalisation that ten
        photographs from ten sources read as one commission:
        a little contrast, a little desaturation, and a slightly
        cooler shadow so they sit against the navy. Highlights are
        left alone — that is what keeps them looking real.

     S  Scrim. Grade R, plus a navy gradient over ONLY the band
        where type sits. The photograph is never darkened as a
        whole; it is darkened locally, where the words need it.
        This is what magazines actually do.

   And it is all baked into the JPEG here, at build time. The
   reference sample did its grading with CSS blend modes, which
   exported into the PDF as 44 luminosity soft masks — and pdf.js,
   which is Firefox's built-in PDF viewer, rendered every one of
   those photos hot pink. Baked pixels cannot do that.

   Usage: node build/grade-images.mjs [slug ...]
   ============================================================ */

import sharp from 'sharp';
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(ROOT, 'assets/images/raw');
const OUT = resolve(ROOT, 'assets/images/graded');
mkdirSync(OUT, { recursive: true });

const MM = (mm, dpi) => Math.round((mm / 25.4) * dpi);

/* Target boxes, in millimetres on the page. Resolution follows the
   placement: a full-bleed page needs 2551px across at 300dpi, a
   62mm card needs 732. Oversampling a card to 2551px would just
   inflate the PDF. */
const BOXES = {
  page: { w: 216, h: 303 },   // full-bleed, incl. bleed
  half: { w: 216, h: 165 },   // full-width band
  card: { w: 62, h: 44 },     // venture card
  tall: { w: 96, h: 130 },    // portrait column
};

const PLAN = {
  'cover-dubai-skyline': { box: 'page', grade: 'S', scrim: 'cover', focus: 'centre' },
  'opening-dubai-road': { box: 'page', grade: 'S', scrim: 'bottom' },
  'connections-port': { box: 'page', grade: 'S', scrim: 'bottom' },
  'future-construction': { box: 'page', grade: 'S', scrim: 'top' },
  'build-dubai-marina': { box: 'page', grade: 'S', scrim: 'bottom' },
  'ventures-automobile': { box: 'card', grade: 'R' },
  'ventures-foodstuff': { box: 'card', grade: 'R' },
  'ventures-analytics': { box: 'card', grade: 'R' },
  'ventures-workspace': { box: 'card', grade: 'R' },
  'ventures-exhibition': { box: 'card', grade: 'R' },
};

/* --- Grade R -------------------------------------------------
   +6% contrast, -8% saturation, and a shadow that leans very
   slightly navy. The per-channel offsets do the last part: blue
   is pulled down least, so dark areas keep a little more blue
   while bright areas, which clip anyway, are untouched. */
const gradeR = (img) =>
  img.linear([1.06, 1.06, 1.06], [-8, -6, -2]).modulate({ saturation: 0.92 });

/* --- Grade S -------------------------------------------------
   The scrim is an SVG gradient composited over the photo. Each
   preset covers only the band where that page puts its type. */
function scrimSVG(kind, w, h) {
  const ink = '#0E1B2B';
  const stops = {
    // Cover: type sits top (kicker), upper-middle (logo) and lower
    // (headline). The middle band stays clear so the city reads.
    cover: `
      <stop offset="0%"   stop-color="${ink}" stop-opacity="0.72"/>
      <stop offset="26%"  stop-color="${ink}" stop-opacity="0.30"/>
      <stop offset="48%"  stop-color="${ink}" stop-opacity="0.14"/>
      <stop offset="68%"  stop-color="${ink}" stop-opacity="0.52"/>
      <stop offset="100%" stop-color="${ink}" stop-opacity="0.92"/>`,
    bottom: `
      <stop offset="0%"   stop-color="${ink}" stop-opacity="0.10"/>
      <stop offset="42%"  stop-color="${ink}" stop-opacity="0.18"/>
      <stop offset="72%"  stop-color="${ink}" stop-opacity="0.68"/>
      <stop offset="100%" stop-color="${ink}" stop-opacity="0.94"/>`,
    top: `
      <stop offset="0%"   stop-color="${ink}" stop-opacity="0.92"/>
      <stop offset="34%"  stop-color="${ink}" stop-opacity="0.55"/>
      <stop offset="62%"  stop-color="${ink}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${ink}" stop-opacity="0.10"/>`,
  }[kind];

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
       <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>
       <rect width="${w}" height="${h}" fill="url(#s)"/>
     </svg>`,
  );
}

function findRaw(slug) {
  const hit = readdirSync(RAW).find((f) => f.replace(/\.[^.]+$/, '') === slug);
  return hit ? resolve(RAW, hit) : null;
}

const wanted = process.argv.slice(2);
const slugs = Object.keys(PLAN).filter((s) => !wanted.length || wanted.includes(s));

for (const slug of slugs) {
  const src = findRaw(slug);
  if (!src) {
    console.log('-  ' + slug + ' - no raw file, skipping');
    continue;
  }

  const spec = PLAN[slug];
  const box = BOXES[spec.box];

  for (const dpi of [300, 150]) {
    const w = MM(box.w, dpi);
    const h = MM(box.h, dpi);

    let img = sharp(src).resize(w, h, { fit: 'cover', position: spec.focus ?? 'centre' });
    img = gradeR(img);

    if (spec.grade === 'S') {
      img = img.composite([{ input: scrimSVG(spec.scrim, w, h), blend: 'over' }]);
    }

    const out = resolve(OUT, slug + '@' + dpi + '.jpg');
    await img
      .jpeg({ quality: dpi === 300 ? 92 : 80, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toFile(out);
  }

  const meta = await sharp(src).metadata();
  const w300 = MM(box.w, 300);
  const enough = meta.width >= w300 * 0.9;
  console.log(
    (enough ? 'OK ' : '!  ') +
      slug.padEnd(22) +
      ('grade ' + spec.grade + (spec.scrim ? '/' + spec.scrim : '')).padEnd(16) +
      (w300 + 'px wide from ' + meta.width + 'px source') +
      (enough ? '' : '  <- source is thin for this placement'),
  );
}

/* ---------- logo cleanup ------------------------------------
   The supplied transparent PNG has a 1-3px fully opaque frame
   baked around its edge. On a photograph that frame renders as a
   faint rectangle floating around the mark, which is exactly the
   kind of detail that makes a cover look homemade. Crop the frame
   off, then trim the surrounding transparency so the mark sits
   tight in its own box and can be sized by width alone. */
{
  const src = resolve(ROOT, 'brand/logo-transparent.png');
  const out = resolve(ROOT, 'brand/logo-mark.png');

  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const alpha = (x, y) => data[(y * w + x) * c + 3];

  /* Walk in from each edge past any row or column that is almost
     entirely opaque — that is the frame, not the artwork. */
  const rowSolid = (y) => { let n = 0; for (let x = 0; x < w; x++) if (alpha(x, y) > 40) n++; return n / w > 0.9; };
  const colSolid = (x) => { let n = 0; for (let y = 0; y < h; y++) if (alpha(x, y) > 40) n++; return n / h > 0.9; };
  let top = 0, bottom = h - 1, left = 0, right = w - 1;
  while (top < h && rowSolid(top)) top++;
  while (bottom > top && rowSolid(bottom)) bottom--;
  while (left < w && colSolid(left)) left++;
  while (right > left && colSolid(right)) right--;

  /* Then take the true bounding box of the mark inside it, so the
     PNG can be placed by width alone with no invisible padding
     throwing the optical centring off. */
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (alpha(x, y) > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }

  await sharp(src)
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .png()
    .toFile(out);

  console.log(
    'OK logo-mark.png          frame ' + top + 'px removed, cropped to artwork ' +
      (x1 - x0 + 1) + 'x' + (y1 - y0 + 1),
  );
}

/* ---------- monogram ----------------------------------------
   The full lockup is mark + "BH VENTURES" + "FZE - LLC". Used as
   a large background watermark it gets cropped by the page edge,
   and a half-cut wordmark reads as a printing mistake rather than
   as a graphic. The monogram alone crops cleanly at any size, so
   it is split out as its own asset.

   The split is found, not hard-coded: scan for horizontal bands
   of content and keep the first one. */
{
  const src = resolve(ROOT, 'brand/logo-mark.png');
  const out = resolve(ROOT, 'brand/logo-monogram.png');
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  const rowHas = (y) => {
    for (let x = 0; x < w; x++) if (data[(y * w + x) * ch + 3] > 8) return true;
    return false;
  };

  let end = 0;
  while (end < h && rowHas(end)) end++;   // first band ends at the first blank row

  let x0 = w, x1 = -1;
  for (let y = 0; y < end; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * ch + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
  }

  await sharp(src)
    .extract({ left: x0, top: 0, width: x1 - x0 + 1, height: end })
    .png()
    .toFile(out);

  console.log('OK logo-monogram.png      mark only, ' + (x1 - x0 + 1) + 'x' + end);
}
