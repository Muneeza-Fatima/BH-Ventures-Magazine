/* ============================================================
   shoot-pages.mjs — render the finished PDF back to page images.

   Two jobs:

   1. Proofing. Looking at the PDF is the only way to see what was
      actually made, as opposed to what the HTML implies.

   2. It renders through **pdf.js**, which is Firefox's built-in
      PDF viewer. So this doubles as the compatibility check: if a
      page looks right here it looks right in Firefox, and the
      reference magazine this project replaced failed exactly that
      test — its photographs came out pink and two pages lost
      their text entirely.

   Output: out/.ink/pNN.png, which check-ink.mjs then measures.

   NOTE: must run outside Claude Code's tool sandbox. Sandboxed,
   headless Chrome renders backgrounds and images but no text at
   all, so every page would come back wordless.

   Usage: node build/shoot-pages.mjs [--scale=1.25]
   ============================================================ */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, unlinkSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PDF = resolve(ROOT, 'out/magazine/'+'BH VENTURES FZE.pdf');
const OUT = resolve(ROOT, 'out/.ink');
const HARNESS = resolve(ROOT, 'build/vendor/render.html');

if (!existsSync(PDF)) {
  console.error('shoot-pages: no PDF yet — run `npm run pdf` first');
  process.exit(2);
}

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!CHROME) {
  console.error('shoot-pages: Chrome not found');
  process.exit(2);
}

const scale = Number(process.argv.find((a) => a.startsWith('--scale='))?.split('=')[1] ?? 1.25);

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.png')) unlinkSync(resolve(OUT, f));

/* Page count, read straight from the file rather than assumed. */
const raw = readFileSync(PDF).toString('latin1');
const pages = (raw.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
if (!pages) {
  console.error('shoot-pages: could not read a page count from the PDF');
  process.exit(2);
}

const fileUrl = (p) => 'file:///' + p.split(String.fromCharCode(92)).join('/');
const pdfUrl = fileUrl(PDF);

console.log('shooting ' + pages + ' pages at scale ' + scale + '…');

for (let n = 1; n <= pages; n++) {
  const out = resolve(OUT, 'p' + String(n).padStart(2, '0') + '.png');
  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--user-data-dir=' + resolve(ROOT, 'out/.chrome-shoot'),
      '--allow-file-access-from-files',
      '--window-size=1000,1420',
      '--virtual-time-budget=40000',
      '--screenshot=' + out.split(String.fromCharCode(92)).join('/'),
      fileUrl(HARNESS) + '?pdf=' + encodeURIComponent(pdfUrl) + '&page=' + n + '&scale=' + scale,
    ],
    { stdio: 'pipe' },
  );
  process.stdout.write('  p' + String(n).padStart(2, '0'));
}

console.log('\nwrote ' + pages + ' images to out/.ink/\n');
