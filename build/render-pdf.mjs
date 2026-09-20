/* ============================================================
   render-pdf.mjs — HTML to PDF.

   Chrome's own --print-to-pdf is used rather than Playwright: the
   browser is already installed, it honours the @page size in
   print.css, and it saves a 300MB Chromium download for a job
   that renders seven static pages.

   Two things this must get right, both of which the reference
   sample got wrong:

     · The page box has to come out at 612x859pt. verify-pdf.mjs
       asserts it after every render.
     · Backgrounds have to print. `print-color-adjust: exact` in
       print.css is what forces that; without it every navy page
       comes out white and nobody notices until it is on paper.

   NOTE ON SANDBOXING: Claude Code's tool sandbox blocks Chrome's
   font rendering on this machine. Sandboxed, headless Chrome
   still draws backgrounds and images but renders NO TEXT AT ALL,
   so the PDF comes out silently wordless. Run this outside the
   sandbox.

   Usage: node build/render-pdf.mjs [--web] [--crops]
   ============================================================ */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const chrome = CHROME_CANDIDATES.find(existsSync);
if (!chrome) {
  console.error('render-pdf: no Chrome or Edge found');
  process.exit(2);
}

const web = process.argv.includes('--web');
const crops = process.argv.includes('--crops');

const OUT = resolve(ROOT, 'out/sample');
mkdirSync(OUT, { recursive: true });

const query = [web ? 'trim=1' : '', crops ? 'crops=1' : ''].filter(Boolean).join('&');
const source = resolve(OUT, 'preview.html');
const target = resolve(OUT, web ? 'BH-Ventures-SAMPLE-WEB.pdf' : 'BH-Ventures-SAMPLE.pdf');

if (!existsSync(source)) {
  console.error('render-pdf: run `node build/build.mjs` first');
  process.exit(2);
}

const url = 'file:///' + source.split(String.fromCharCode(92)).join('/') + (query ? '?' + query : '');

execFileSync(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    '--user-data-dir=' + resolve(ROOT, 'out/.chrome'),
    '--allow-file-access-from-files',
    '--virtual-time-budget=30000',
    '--print-to-pdf=' + target.split(String.fromCharCode(92)).join('/'),
    url,
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

console.log('wrote ' + target.replace(ROOT + String.fromCharCode(92), ''));
