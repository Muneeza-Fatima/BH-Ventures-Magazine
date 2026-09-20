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
const page = process.argv[2] ?? resolve(ROOT, 'out/sample/preview.html');
if (!existsSync(page)) {
  console.error('check-fit: no such file: ' + page);
  process.exit(2);
}

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROBE = resolve(ROOT, 'out/.fit-probe.html');

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
    p.querySelectorAll('.page > *').forEach(function () {});
    Array.prototype.forEach.call(p.children, function (el) {
      if (el.classList.contains('folio')) return;
      if (getComputedStyle(el).position === 'absolute') return;
      var b = el.getBoundingClientRect().bottom - p.getBoundingClientRect().top;
      if (b > lowest) lowest = b;
    });
    out.push((i + 1) + ':' + Math.round(lowest) + ':' + Math.round(limit));
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
  const [n, lowest, limit] = entry.split(':').map(Number);
  const over = (lowest - limit) / PX_PER_MM;
  if (over > 0.5) {
    bad++;
    console.log('  page ' + n + '  content runs ' + over.toFixed(1) + 'mm past the margin');
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
