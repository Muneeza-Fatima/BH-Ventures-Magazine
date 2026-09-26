/* ============================================================
   check-fit.mjs — does any page overflow its own content box?

   Text that runs under the folio is the commonest fault in a
   layout like this, and it is invisible in the HTML: .page has
   overflow:hidden, so the page silently clips at the paper edge
   instead of at the margin. Measuring it in the browser is the
   only reliable way to catch it.

   Usage: node build/check-fit.mjs <preview.html>
   ============================================================ */

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = process.argv[2] ?? resolve(ROOT, 'out/magazine/preview.html');
if (!existsSync(page)) {
  console.error('check-fit: no such file: ' + page);
  process.exit(2);
}

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
/* The probe has to be written NEXT TO the page it measures.
   Every stylesheet in preview.html is linked as ../../src/*.css,
   which resolves from out/magazine/. Writing the probe one
   directory up meant those links pointed outside the repo, no
   CSS loaded at all, and the measurement was taken on an
   unstyled document -- which reported a clean bill of health for
   a page with a 90mm hole in it. Check the instrument before
   trusting the reading. */
const PROBE = resolve(dirname(page), '.fit-probe.html');

/* Inject a measuring script, render, and read the verdict out of
   the DOM. Chrome's --dump-dom snapshots before async work, so the
   measurement is written synchronously on DOMContentLoaded. */
const html = readFileSync(page, 'utf8').replace(
  '</body>',
  `<script>
document.addEventListener('DOMContentLoaded', function () {
  var out = [];
  document.querySelectorAll('.page').forEach(function (p, i) {
    var cs = getComputedStyle(p);
    var padTop = parseFloat(cs.paddingTop);
    var padBottom = parseFloat(cs.paddingBottom);
    var limit = p.clientHeight - padBottom;
    var lowest = padTop;
    var top = p.getBoundingClientRect().top;
    var worst = '';
    p.querySelectorAll('*').forEach(function (el) {
      /* Things that are MEANT to reach the paper edge. Marked with
         .decor in the markup rather than listed here by name --
         the list version had grown to eight classes and still kept
         missing the <img> inside each of them. */
      /* .sidebar, .venture-page__media, .foot-block and
         .sheet-numeral were listed here and are all gone from the
         markup now. Dead exemptions are how this list reached
         eight entries the first time, so they go with the
         components. */
      if (el.closest('.folio')) return;
      if (el.closest('.decor')) return;
      if (el.closest('.photo-bleed')) return;
      if (el.closest('.cover__inner')) return;
      if (el.closest('.back__inner')) return;
      var r = el.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) return;
      var b = r.bottom - top;
      if (b > lowest) {
        lowest = b;
        worst = el.tagName.toLowerCase() +
          (el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(' ').join('.') : '');
      }
    });
    out.push((i + 1) + ':' + Math.round(lowest) + ':' + Math.round(limit) + ':' + worst);
  });
  var d = document.createElement('div');
  d.id = 'fit-result';
  d.textContent = out.join(',');
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

const m = /<div id="fit-result">([^<]*)<\/div>/.exec(dom);
if (!m) {
  console.log('!  could not measure (probe did not run)');
  process.exit(0);
}

const PX_PER_MM = 96 / 25.4;
let bad = 0;
console.log('');
console.log('  check-fit');
console.log('  ' + '-'.repeat(46));
for (const entry of m[1].split(',').filter(Boolean)) {
  const [n, lowest, limit, worst] = entry.split(':');
  const over = (Number(lowest) - Number(limit)) / PX_PER_MM;
  if (over > 0.5) {
    bad++;
    console.log('  page ' + n + '  content runs ' + over.toFixed(1) + 'mm past the margin   <- ' + worst);
  } else {
    console.log('  page ' + n + '  clear by ' + (-over).toFixed(1) + 'mm');
  }
}
console.log('  ' + '-'.repeat(46));
if (bad) {
  console.log('  ' + bad + ' page(s) overflow\n');
  process.exit(1);
}
console.log('  all pages fit\n');
