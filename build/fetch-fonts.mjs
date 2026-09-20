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

   Fraunces is fetched at three optical sizes because that axis is
   the whole reason for choosing it: 144 for display, 72 for
   section headings and figures, 36 for pull-quotes.

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

/* ital,opsz,wght,SOFT,WONK — every axis pinned to one value, which
   is what makes the response static rather than variable. */
const fraunces = (ital, opsz, wght) =>
  `https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@${ital},${opsz},${wght},0,1&display=swap`;

const FILES = [
  { name: 'fraunces-144.woff2',  css: fraunces(0, 144, 500) },
  { name: 'fraunces-144i.woff2', css: fraunces(1, 144, 500) },
  { name: 'fraunces-72.woff2',   css: fraunces(0, 72, 500) },
  { name: 'fraunces-72i.woff2',  css: fraunces(1, 72, 500) },
  { name: 'fraunces-36.woff2',   css: fraunces(0, 36, 400) },
  { name: 'fraunces-36i.woff2',  css: fraunces(1, 36, 400) },
  { name: 'inter-400.woff2',     css: 'https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap' },
  { name: 'inter-600.woff2',     css: 'https://fonts.googleapis.com/css2?family=Inter:wght@600&display=swap' },
  { name: 'grotesk-400.woff2',   css: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400&display=swap' },
  { name: 'grotesk-500.woff2',   css: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500&display=swap' },
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
