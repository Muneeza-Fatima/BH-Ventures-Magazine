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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const OUT = resolve(ROOT, 'out/magazine');
mkdirSync(OUT, { recursive: true });

/* THE FLAGS USED TO DO NOTHING, and silently.

   They were passed to Chrome as a query string - preview.html?
   crops=1 - and nothing read it. There is no JavaScript in this
   page and there must not be: a script in the source of a print
   PDF is a thing that can fail. So .crops and .trim sat in
   print.css as dead rules for however long, and every
   --crops run produced a file identical to a plain one.

   The class goes on <body> instead, written into a copy of the
   page. preview.html itself is never touched, so the screen
   preview and the press file cannot drift apart: they are the
   same HTML with one attribute different. */
const source = resolve(OUT, 'preview.html');
const target = resolve(OUT, web ? 'BH VENTURES FZE - WEB.pdf' : 'BH VENTURES FZE.pdf');

if (!existsSync(source)) {
  console.error('render-pdf: run `node build/build.mjs` first');
  process.exit(2);
}

const bodyClass = [web ? 'trim' : '', crops ? 'crops' : ''].filter(Boolean).join(' ');
let page = source;

if (bodyClass) {
  const html = readFileSync(source, 'utf8');
  if (!html.includes('<body>')) {
    console.error('render-pdf: no plain <body> in preview.html to mark');
    process.exit(2);
  }
  page = resolve(OUT, '.press.html');
  writeFileSync(page, html.replace('<body>', '<body class="' + bodyClass + '">'));
}

const url = 'file:///' + page.split(String.fromCharCode(92)).join('/');

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
