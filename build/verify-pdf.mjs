/* ============================================================
   verify-pdf.mjs — the gate every PDF must pass before it ships.

   Each check here exists because the reference sample failed it:

     1. GEOMETRY   sample was 793x1122pt (its HTML px exported as
                   pt). A printer would have shrunk everything 33%.
     2. PAGE COUNT sample had 11 pages. Saddle-stitch needs a
                   multiple of 4, so 11 cannot be bound at all.
     3. TRANSPARENCY sample carried 44 /Luminosity soft masks and
                   504 transparency groups. pdf.js — which is
                   Firefox's built-in viewer — rendered every hero
                   photo hot pink and dropped text on two pages.
     4. FONTS      a PDF with unembedded fonts resets to Times at
                   the print shop.

   Usage:  node build/verify-pdf.mjs <file.pdf> [--pages=N] [--trim] [--stitched]
           --stitched  also require a multiple of 4 (final magazine only;
                       a 7-page sample is not going to be bound)
   Exits non-zero on any failure, so it can gate a build.
   ============================================================ */

import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { basename } from 'node:path';

const MM_PER_PT = 25.4 / 72;
const PT = (mm) => (mm / 25.4) * 72;

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const trimMode = args.includes('--trim');
const stitched = args.includes('--stitched');
const wantPages = Number(args.find((a) => a.startsWith('--pages='))?.split('=')[1] ?? 0);

if (!file || !existsSync(file)) {
  console.error(`verify-pdf: no such file: ${file ?? '(none)'}`);
  process.exit(2);
}

/* Expected media box. PRINT carries 3mm bleed on every side;
   the trimmed WEB variant is plain A4. */
const expect = trimMode
  ? { w: PT(210), h: PT(297), label: 'A4 trimmed 210x297mm' }
  : { w: PT(216), h: PT(303), label: 'A4 + 3mm bleed 216x303mm' };

const buf = readFileSync(file);
const rawOnly = buf.toString('latin1');

/* PDF 1.5+ packs most object definitions into compressed object
   streams, so a plain string scan sees almost none of them. The
   first version of this checker reported "only ArialMT embedded"
   on a PDF that in fact carried all three faces — the font
   dictionaries were simply inside /ObjStm. Inflate every Flate
   stream and search the decompressed text as well. */
function inflateAll(buffer, text) {
  const parts = [text];
  const re = /\/Filter\s*(?:\/FlateDecode|\[\s*\/FlateDecode\s*\])[^>]*>>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      parts.push(inflateSync(buffer.subarray(start, end)).toString('latin1'));
    } catch {
      /* not every Flate stream is inflatable on its own (some are
         image data with predictors); skipping them is harmless
         here because we are only looking for name tokens. */
    }
  }
  return parts.join('\n');
}

const raw = inflateAll(buf, rawOnly);

const failures = [];
const warnings = [];
const ok = [];

const fail = (m) => failures.push(m);
const warn = (m) => warnings.push(m);
const pass = (m) => ok.push(m);

/* ---------- 1. GEOMETRY ------------------------------------ */

const boxes = [...rawOnly.matchAll(/\/MediaBox\s*\[\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s*\]/g)]
  .map((m) => ({
    w: Math.abs(parseFloat(m[3]) - parseFloat(m[1])),
    h: Math.abs(parseFloat(m[4]) - parseFloat(m[2])),
  }));

if (!boxes.length) {
  fail('no /MediaBox found — cannot confirm page size');
} else {
  const tol = 1.5; // pt
  const bad = boxes.filter((b) => Math.abs(b.w - expect.w) > tol || Math.abs(b.h - expect.h) > tol);
  const show = (b) =>
    `${b.w.toFixed(1)}x${b.h.toFixed(1)}pt (${(b.w * MM_PER_PT).toFixed(1)}x${(b.h * MM_PER_PT).toFixed(1)}mm)`;

  if (bad.length) {
    fail(
      `page size wrong: found ${show(bad[0])}, expected ${expect.w.toFixed(1)}x${expect.h.toFixed(1)}pt — ${expect.label}`,
    );
    const r = bad[0].w / expect.w;
    if (Math.abs(r - 96 / 72) < 0.02) {
      fail('  ↳ ratio is exactly 96/72 — this is the px-exported-as-pt bug the reference sample shipped');
    }
  } else {
    pass(`geometry ${show(boxes[0])} — ${expect.label}`);
  }
}

/* ---------- 2. PAGE COUNT ---------------------------------- */

/* /Type /Page but not /Pages — the negative lookahead keeps the
   page-tree node from being counted as a page. */
const pageCount = (raw.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;

if (!pageCount) {
  fail('could not determine page count');
} else {
  pass(`${pageCount} pages`);
  if (wantPages && pageCount !== wantPages) {
    fail(`expected exactly ${wantPages} pages, found ${pageCount}`);
  }
  if (stitched && pageCount % 4 !== 0) {
    fail(`${pageCount} pages cannot be saddle-stitched — needs a multiple of 4 (${Math.ceil(pageCount / 4) * 4} would work)`);
  }
}

/* ---------- 3. LIVE TRANSPARENCY --------------------------- */

const lum = (raw.match(/\/Luminosity/g) ?? []).length;
const smask = (raw.match(/\/SMask(?!\s*\/None)/g) ?? []).length;
const tGroup = (raw.match(/\/S\s*\/Transparency/g) ?? []).length;
const blend = [...raw.matchAll(/\/BM\s*\/(\w+)/g)].map((m) => m[1]).filter((b) => b !== 'Normal' && b !== 'Compatible');

if (lum) {
  fail(`${lum} /Luminosity soft mask(s) — image grading must be baked by sharp, not done with CSS blend modes`);
  fail('  ↳ this is exactly what turns every photo pink in Firefox / pdf.js');
}
if (blend.length) {
  fail(`${blend.length} non-normal blend mode(s): ${[...new Set(blend)].join(', ')} — bake these into the image instead`);
}
if (tGroup) {
  warn(`${tGroup} transparency group(s) — acceptable only if they come from flat PNG alpha (logo), not from blend modes`);
}
if (!lum && !blend.length) {
  pass(`no live blending (${smask} soft mask${smask === 1 ? '' : 's'}, ${tGroup} transparency group${tGroup === 1 ? '' : 's'})`);
}

/* ---------- 4. EMBEDDED FONTS ------------------------------ */

const embedded = (raw.match(/\/FontFile[23]?\b/g) ?? []).length;
const faces = [...new Set([...raw.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+#,._-]+)/g)].map((m) => m[1]))];
const clean = faces.map((f) => f.replace(/^[A-Z]{6}\+/, '').replace(/#20/g, ' '));

if (!embedded) {
  fail('no embedded font files — text will reset to a default face at the print shop');
} else {
  pass(`${embedded} embedded font file(s): ${clean.join(', ') || '(unnamed)'}`);
}

const expectedFaces = ['Fraunces', 'Inter', 'SpaceGrotesk', 'Space Grotesk'];
const missing = ['Fraunces', 'Inter', 'Space Grotesk'].filter(
  (want) => !clean.some((f) => f.replace(/\s/g, '').toLowerCase().includes(want.replace(/\s/g, '').toLowerCase())),
);
if (embedded && missing.length) {
  warn(`expected face(s) not found in PDF: ${missing.join(', ')} — check @font-face paths resolved`);
}

/* ---------- 5. DARK PAGES ACTUALLY PRINTED ------------------
   printBackground:false is the classic silent failure: the PDF
   looks fine in outline but every navy page comes out white.
   A magazine this dark must contain large dark fills. */

const images = (raw.match(/\/Subtype\s*\/Image/g) ?? []).length;
const hasDarkFill = /0\.0?5[0-9]? 0\.1[0-9]* 0\.1[0-9]*/.test(raw) || /\/Cs\d|\/DeviceRGB/.test(raw);

if (buf.length < 40_000 && pageCount > 2) {
  fail(`file is only ${(buf.length / 1024).toFixed(0)}KB for ${pageCount} pages — backgrounds almost certainly did not print (printBackground)`);
} else {
  pass(`${(buf.length / 1024 / 1024).toFixed(2)} MB, ${images} image object(s)`);
}

/* ---------- REPORT ----------------------------------------- */

const line = '─'.repeat(64);
console.log(`\n${line}\n  verify-pdf  ·  ${basename(file)}${trimMode ? '  (trimmed web variant)' : ''}\n${line}`);
for (const m of ok) console.log(`  ✓  ${m}`);
for (const m of warnings) console.log(`  !  ${m}`);
for (const m of failures) console.log(`  ✗  ${m}`);
console.log(line);

if (failures.length) {
  console.log(`  FAILED — ${failures.length} problem${failures.length === 1 ? '' : 's'}\n`);
  process.exit(1);
}
console.log(`  PASSED${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : ''}\n`);
