/* ============================================================
   fetch-fonts.mjs — download the typefaces as STATIC instances.

   This matters more than it sounds. Chrome's PDF export embeds a
   VARIABLE font as a Type 3 font — glyphs as little drawing
   programs rather than as an embedded typeface. The page looks
   correct on screen, but:

     · Type 3 is not permitted in PDF/X-4, the standard a printer
       will ask for.
     · Many prepress RIPs reject or silently rasterise it.

   Pinning every axis in the Google Fonts css2 request returns a
   static instance instead, which Chrome embeds properly as
   CIDFontType2 + FontFile2. Verified both ways: variable gave
   "Type3: 1", pinned static gives "Type3: 0, FontFile2: 1", and
   the face is still FrauncesWonky144pt-Medium — so the optical
   size and the WONK axis the design wants are preserved.

   Playfair Display is the display face. It replaced Poppins because
   Poppins is a geometric sans and a geometric sans does not read as
   a magazine - it reads as a website. Playfair is a high-contrast
   serif: the visible difference between thick and thin strokes is
   the thing the eye actually recognises as editorial, and it is what
   mastheads have been set in for two hundred years.

   It is also the right partner for the cover: the building cutout is
   all straight verticals, and a serif contrasts with that where a
   geometric sans competes with it.

   Playfair IS a variable font on Google Fonts, so every axis here is
   pinned - that is what makes the response a static instance, and
   verify-pdf.mjs asserts Type3 = 0 on the far end.

   Inter stays for body copy. Poppins is wide and tiring in long
   paragraphs at 9.5pt; Inter is not, and it is already tuned to the
   body size. Note its opsz axis is now pinned too - it was NOT
   before, which broke this file's own rule and was passing on luck.

   Usage: node build/fetch-fonts.mjs
   ============================================================ */

import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'assets/fonts');
mkdirSync(OUT, { recursive: true });

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const curl = (url, out) =>
  execFileSync('curl', out ? ['-s', '-4', '-A', UA, '-o', out, url] : ['-s', '-4', '-A', UA, url], {
    encoding: out ? 'buffer' : 'utf8',
    maxBuffer: 1 << 26,
  });

/* Google serves one @font-face block per unicode subset. We only
   set Latin text, so pulling the others would trebles the weight
   of every file for nothing. */
function latinUrl(css) {
  const blocks = css.split('/*').map((b) => '/*' + b);
  const latin = blocks.find((b) => b.startsWith('/* latin */'));
  return /https:\/\/[^)]+/.exec(latin ?? '')?.[0] ?? null;
}

/* Every axis pinned to one value, which is what makes the response
   static rather than variable. Inter has TWO axes (opsz, wght) and
   both must be named, or Google may serve the variable file and
   Chrome embeds it as Type 3. */
/* Every axis pinned to one value, which is what makes the response
   static rather than variable. Inter has TWO axes (opsz, wght) and
   both must be named, or Google may serve the variable file and
   Chrome embeds it as Type 3. */
const playfair = (ital, wght) =>
  `https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@${ital},${wght}&display=swap`;

const inter = (ital, wght) =>
  `https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@${ital},14,${wght}&display=swap`;

const FILES = [
  { name: 'playfair-500.woff2',  css: playfair(0, 500) },   // section headings, card titles
  { name: 'playfair-500i.woff2', css: playfair(1, 500) },   // the emphasised half of a headline
  { name: 'playfair-700.woff2',  css: playfair(0, 700) },   // cover, chapter openers
  { name: 'playfair-700i.woff2', css: playfair(1, 700) },   // the cover's second line

  { name: 'inter-400.woff2',    css: inter(0, 400) },
  { name: 'inter-400i.woff2',   css: inter(1, 400) },
  { name: 'inter-500.woff2',    css: inter(0, 500) },
  { name: 'inter-600.woff2',    css: inter(0, 600) },
];

for (const f of FILES) {
  const url = latinUrl(curl(f.css));
  if (!url) {
    console.log('X  ' + f.name + ' - no latin subset in the response');
    continue;
  }
  const dest = resolve(OUT, f.name);
  curl(url, dest);

  const size = statSync(dest).size;
  const sig = readFileSync(dest).toString('latin1', 0, 4);
  console.log((sig === 'wOF2' ? 'OK ' : 'X  ') + f.name.padEnd(22) + String(size).padStart(7) + 'B  ' + sig);
}
