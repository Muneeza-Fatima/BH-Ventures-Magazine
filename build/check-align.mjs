/* ============================================================
   check-align.mjs — does every page stand on the same grid?

   check-fit looks at the foot of each page and check-space at the
   holes in it. Neither looks sideways, or at where a page STARTS,
   so a hairline 1mm lower on ten pages, a facts grid running 4mm
   into the gutter, or a logo 2mm off centre all passed every
   build. This measures what a reader sees when flipping:

   - the first hairline sits at the same height on every page
   - the heading starts the same distance under it
   - rail, rule, heading and text share the text column's left
     edge, and nothing runs past either edge of the column
   - the folio is in the same place on every page

   Things that are meant to leave the column - photographs, bands,
   picture credits on the plate edge - are marked .decor or named
   in EXEMPT below. The cover and back cover set their own insets
   and are skipped.

   Usage: node build/check-align.mjs [preview.html]
   ============================================================ */

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = process.argv[2] ?? resolve(ROOT, 'out/magazine/preview.html');
if (!existsSync(page)) {
  console.error('check-align: no such file: ' + page);
  process.exit(2);
}

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
/* Next to the page, for the same reason as check-fit: the
   stylesheet links are relative to out/magazine/. */
const PROBE = resolve(dirname(page), '.align-probe.html');

const html = readFileSync(page, 'utf8').replace(
  '</body>',
  `<script>
document.addEventListener('DOMContentLoaded', function () {
  var MM = 96 / 25.4;
  var EXEMPT = /(plate|band|credit|stratum|photo|flag|__mark)/;
  function name(el) {
    return el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
  }
  function mm(v) { return Math.round(v / MM * 10) / 10; }
  var pages = [];
  document.querySelectorAll('.page').forEach(function (p, i) {
    var rec = { n: i + 1, skip: p.classList.contains('page--bleed') };
    var pr = p.getBoundingClientRect();
    var cs = getComputedStyle(p);
    var colL = pr.left + parseFloat(cs.paddingLeft);
    var colR = pr.right - parseFloat(cs.paddingRight);
    rec.colL = mm(colL - pr.left);
    rec.colR = mm(pr.right - colR);

    var rule = p.querySelector(':scope > .rule, :scope > .rule--brand');
    if (rule) rec.ruleTop = mm(rule.getBoundingClientRect().top - pr.top);
    rec.venture = p.classList.contains('venture-page');
    /* On a venture page the numeral is the first thing under the
       rule, so it is what has to start at the same height. */
    var h1 = p.querySelector(rec.venture ? '.venture__n' : 'h1');
    if (h1 && rule) {
      var hr = h1.getBoundingClientRect();
      rec.titleGap = mm(hr.top - rule.getBoundingClientRect().bottom);
      rec.titleL = mm(hr.left - colL);
    }
    var head = p.querySelector(':scope > .kicker, :scope > [class*="__rail"], :scope > [class*="__kicker"]');
    if (head) rec.headL = mm(head.getBoundingClientRect().left - colL);

    var f = p.querySelector('.folio');
    if (f) {
      var fr = f.getBoundingClientRect();
      rec.folio = [mm(fr.left - pr.left), mm(pr.right - fr.right), mm(pr.bottom - fr.bottom)];
    }

    var outs = [];
    if (!rec.skip) p.querySelectorAll('*').forEach(function (el) {
      if (el.closest('.folio, .decor, .photo-bleed, svg')) return;
      for (var a = el; a && a !== p; a = a.parentElement) {
        if (typeof a.className === 'string' && EXEMPT.test(a.className)) return;
      }
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var l = (r.left - colL) / MM, rr = (r.right - colR) / MM;
      if (l < -0.5 || rr > 0.5) outs.push(name(el) + ' ' + (l < -0.5 ? 'L' + l.toFixed(1) : '') + (rr > 0.5 ? ' R+' + rr.toFixed(1) : ''));
    });
    rec.outs = outs.slice(0, 4);
    pages.push(rec);
  });
  var d = document.createElement('div');
  d.id = 'align-result';
  d.textContent = JSON.stringify(pages);
  document.body.appendChild(d);
});
</script></body>`,
);
writeFileSync(PROBE, html);

const dom = execFileSync(
  CHROME,
  [
    '--headless=new', '--disable-gpu',
    '--user-data-dir=' + resolve(ROOT, 'out/.chrome-fit'),
    '--allow-file-access-from-files',
    '--virtual-time-budget=20000',
    '--dump-dom',
    'file:///' + PROBE.split(String.fromCharCode(92)).join('/'),
  ],
  { encoding: 'utf8', maxBuffer: 1 << 28 },
);

const m = /<div id="align-result">([^<]*)<\/div>/.exec(dom);
if (!m) {
  console.log('!  could not measure (probe did not run)');
  process.exit(0);
}
const pages = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

/* The book's reference values are what most pages do. */
function mode(xs) {
  const c = new Map();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1])[0]?.[0];
}
const body = pages.filter((p) => !p.skip);
const RULE = mode(body.map((p) => p.ruleTop).filter((v) => v != null));
const GAP = mode(body.filter((p) => !p.venture).map((p) => p.titleGap).filter((v) => v != null));
const VGAP = mode(body.filter((p) => p.venture).map((p) => p.titleGap).filter((v) => v != null));
const FOLIO = mode(body.map((p) => p.folio?.[2]).filter((v) => v != null));
const TOL = 0.5;

/* Pages that are allowed to differ, and why. */
const ALLOW_GAP = {
  2: 'imprint: the statement sits at the waist of the page, under the mark',
};
const ALLOW = {
  4: 'opening: the kicker sits in the navy stratum, no top hairline',
  23: 'future: the heading is in the column beside the plate',
};

let bad = 0;
console.log('');
console.log('  check-align   hairline ' + RULE + 'mm · title gap ' + GAP + 'mm · folio ' + FOLIO + 'mm');
console.log('  ' + '-'.repeat(60));
for (const p of pages) {
  if (p.skip) { console.log('  page ' + String(p.n).padStart(2) + '  (full-bleed, own insets)'); continue; }
  const faults = [];
  const allowed = ALLOW[p.n];
  if (!allowed) {
    if (p.ruleTop != null && Math.abs(p.ruleTop - RULE) > TOL) faults.push('hairline at ' + p.ruleTop + 'mm');
    if (p.titleGap != null && !ALLOW_GAP[p.n] && Math.abs(p.titleGap - (p.venture ? VGAP : GAP)) > TOL) faults.push('title ' + p.titleGap + 'mm under rule');
    if (p.titleL != null && Math.abs(p.titleL) > TOL) faults.push('title off column by ' + p.titleL + 'mm');
  }
  if (p.headL != null && Math.abs(p.headL) > TOL) faults.push('rail off column by ' + p.headL + 'mm');
  if (p.folio && Math.abs(p.folio[2] - FOLIO) > TOL) faults.push('folio at ' + p.folio[2] + 'mm');
  if (p.folio && (Math.abs(p.folio[0] - p.colL) > TOL || Math.abs(p.folio[1] - p.colR) > TOL)) {
    faults.push('folio ' + p.folio[0] + '/' + p.folio[1] + ' vs column ' + p.colL + '/' + p.colR);
  }
  for (const o of p.outs) faults.push('outside column: ' + o);
  if (faults.length) {
    bad++;
    console.log('  page ' + String(p.n).padStart(2) + '  ' + faults.join('\n           '));
  } else {
    console.log('  page ' + String(p.n).padStart(2) + '  aligned' + (allowed ? '   (' + allowed + ')' : ''));
  }
}
console.log('  ' + '-'.repeat(60));
if (bad) {
  console.log('  ' + bad + ' page(s) off the grid\n');
  process.exit(1);
}
console.log('  every page on the grid\n');
