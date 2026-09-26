/* ============================================================
   site.mjs — package the magazine as a static site for Vercel.

   `npm run build` cannot run on Vercel: render-pdf.mjs drives a
   local Chrome, and the build machine has none. It does not need
   to. The PDF is built here, on a machine with Chrome, and
   committed; the host only has to serve what already exists.

   Output, dist/:
     index.html                 preview.html, paths rebased
     BH-Ventures-FZE.pdf        the committed PDF, if present
     src/ brand/ assets/        only the files the page links to,
                                plus the fonts fonts.css loads

   preview.html links everything as ../../x because it lives in
   out/magazine/. At the site root that becomes x, and the tree
   under it keeps the same shape, so the stylesheets' own
   relative url()s still resolve.

   Usage: node build/site.mjs      (after npm run html)
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'dist');
const PREVIEW = resolve(ROOT, 'out/magazine/preview.html');
const PDF = resolve(ROOT, 'out/magazine/BH VENTURES FZE.pdf');

if (!existsSync(PREVIEW)) {
  console.error('site: no preview.html - run `npm run html` first');
  process.exit(2);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

function copy(rel) {
  const from = resolve(ROOT, rel);
  if (!existsSync(from)) {
    console.error('site: missing ' + rel);
    process.exitCode = 1;
    return;
  }
  const to = resolve(OUT, rel);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

const html = readFileSync(PREVIEW, 'utf8');
const refs = new Set();
for (const m of html.matchAll(/(?:href|src)="\.\.\/\.\.\/([^"?#]+)/g)) refs.add(decodeURI(m[1]));
for (const rel of refs) copy(rel);

/* fonts.css pulls its woff2 files itself; the page never names them. */
for (const f of readdirSync(resolve(ROOT, 'assets/fonts'))) {
  if (f.endsWith('.woff2')) copy(join('assets/fonts', f));
}

writeFileSync(resolve(OUT, 'index.html'), html.replaceAll('../../', ''));

if (existsSync(PDF)) copyFileSync(PDF, resolve(OUT, 'BH-Ventures-FZE.pdf'));
else console.log('site: no PDF committed - the site ships without the download');

console.log('wrote dist/ (' + refs.size + ' linked files, index.html' + (existsSync(PDF) ? ', PDF' : '') + ')');
