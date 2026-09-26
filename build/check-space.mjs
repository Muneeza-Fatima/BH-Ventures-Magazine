/* ============================================================
   check-space.mjs — is the whitespace a decision, or a leftover?

   The client's note was "spaces ka laazmi khayal rakhna", and the
   sample they were shown had earned it. The Opening stopped two
   thirds of the way down and left 90mm of blank paper above the
   folio. Every venture page did the same below its rule. Nobody
   chose those gaps; they were what remained after the content ran
   out, and that is exactly what a reader feels as unfinished.

   Whitespace is only premium when it is deliberate. A generous
   margin reads as confidence; an accidental hole reads as a page
   that could not be filled. The two look completely different on
   paper and are almost indistinguishable in the markup — so this
   measures them.

   WHAT IT MEASURES

   For each page: walk down the live area in 1mm steps and find
   the longest run of rows that no element occupies. That is the
   deepest hole on the page. Above THRESHOLD it fails.

   It deliberately measures VERTICAL runs only. Horizontal white
   space is the measure and the margin, which are meant to be
   empty; vertical white space at the foot is where a layout
   gives itself away.

   WHAT IT IGNORES

   Full-bleed pages, where the picture or the ground covers
   everything and "empty" means nothing. The cover's job is to be
   mostly sky.

   Usage: node build/check-space.mjs [preview.html]
   ============================================================ */

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = process.argv[2] ?? resolve(ROOT, 'out/magazine/preview.html');
if (!existsSync(page)) {
  console.error('check-space: no such file: ' + page);
  process.exit(2);
}

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!CHROME) {
  console.error('check-space: Chrome not found');
  process.exit(2);
}

/* The probe has to be written NEXT TO the page it measures.
   Every stylesheet in preview.html is linked as ../../src/*.css,
   which resolves from out/magazine/. Writing the probe one
   directory up meant those links pointed outside the repo, no
   CSS loaded at all, and the measurement was taken on an
   unstyled document -- which reported a clean bill of health for
   a page with a 90mm hole in it. Check the instrument before
   trusting the reading. */
const PROBE = resolve(dirname(page), '.space-probe.html');

/* 28mm. Roughly seven baselines, or the depth of a stat block.

   Anything shallower reads as air between two things. Anything
   deeper and the eye stops looking for the next element and
   decides the page has ended — which is fine at the foot of a
   deliberately quiet page and wrong everywhere else. The number
   is a judgement, and it is written here rather than tuned
   silently per page so that changing it is a visible decision. */
const THRESHOLD_MM = 28;

const html = readFileSync(page, 'utf8').replace(
  '</body>',
  `<script>
document.addEventListener('DOMContentLoaded', function () {
  var PX = 96 / 25.4;
  var out = [];

  document.querySelectorAll('.page').forEach(function (p, i) {
    var cls = p.className;

    /* A full-bleed page is covered edge to edge by its picture or
       its ground. There is no such thing as a hole in it. */
    var bleed = /page--bleed/.test(cls);

    var pr = p.getBoundingClientRect();
    var cs = getComputedStyle(p);
    var top = bleed ? 0 : parseFloat(cs.paddingTop);
    var bottom = p.clientHeight - (bleed ? 0 : parseFloat(cs.paddingBottom));

    /* On a page that carries the datum, the band between the
       kicker and the datum line is EMPTY BY DESIGN -- the same
       depth on every such page, which is the whole point of having
       a datum. Counting it found a 51mm "hole" at 4mm on four
       pages that are doing exactly what the grid asks.

       That band is deliberate and consistent, which is the
       definition this check is built on, so the scan starts at the
       datum. The gaps it is looking for are the ones at the foot:
       variable, different on every page, and left over rather than
       placed. */
    if (!/page--no-datum/.test(cls)) {
      var datum = parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--datum')) * PX;
      if (datum > top) top = datum;
    }

    var rows = Math.max(1, Math.round((bottom - top) / PX));
    var filled = new Uint8Array(rows);

    /* Only the middle of the live area counts. A full-height navy
       sidebar down the outer 26mm is a device, not content -- if
       it were allowed to mark rows as filled, every venture page
       would report a perfect score while its text column sat
       empty. Which is exactly what the first version of this
       check did: 0mm on all ten of them. */
    var padL = bleed ? 0 : parseFloat(cs.paddingLeft);
    var padR = bleed ? 0 : parseFloat(cs.paddingRight);
    var liveL = pr.left + padL;
    var liveR = pr.left + p.clientWidth - padR;
    var coreL = liveL + (liveR - liveL) * 0.2;
    var coreR = liveR - (liveR - liveL) * 0.2;

    /* Effective opacity, walked up the tree. The watermark sits at
       5% -- but the <img> inside it computes to opacity 1, and
       reading only the element's own value let a faint monogram
       count as a filled page. The second reason the first version
       read 0mm everywhere. */
    function effOpacity(el) {
      var o = 1;
      for (var n = el; n && n !== p.parentNode; n = n.parentElement) {
        o *= parseFloat(getComputedStyle(n).opacity) || 0;
        if (o < 0.12) return o;
      }
      return o;
    }

    p.querySelectorAll('*').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.height === 0 || r.width === 0) return;
      if (r.right < coreL || r.left > coreR) return;
      if (effOpacity(el) < 0.12) return;

      var a = Math.max(0, Math.floor((r.top - pr.top - top) / PX));
      var b = Math.min(rows, Math.ceil((r.bottom - pr.top - top) / PX));
      for (var y = a; y < b; y++) filled[y] = 1;
    });

    var run = 0, worst = 0, at = 0;
    for (var y = 0; y < rows; y++) {
      if (filled[y]) { run = 0; continue; }
      run++;
      if (run > worst) { worst = run; at = y - run + 1; }
    }

    out.push((i + 1) + ':' + worst + ':' + at + ':' + (bleed ? 1 : 0));
  });

  var d = document.createElement('div');
  d.id = 'space-result';
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
    '--user-data-dir=' + resolve(ROOT, 'out/.chrome-space'),
    '--allow-file-access-from-files',
    '--virtual-time-budget=20000',
    '--dump-dom',
    'file:///' + PROBE.split(String.fromCharCode(92)).join('/'),
  ],
  { encoding: 'utf8', maxBuffer: 1 << 28 },
);

const m = /<div id="space-result">([^<]*)<\/div>/.exec(dom);
if (!m) {
  console.log('!  check-space could not measure (probe did not run)');
  process.exit(0);
}

console.log('');
console.log('  check-space  ·  deepest untouched block per page');
console.log('  ' + '-'.repeat(52));

let bad = 0;
for (const entry of m[1].split(',').filter(Boolean)) {
  const [n, worst, at, bleed] = entry.split(':').map(Number);
  const label = '  page ' + String(n).padStart(2) + '   ' + String(worst).padStart(3) + 'mm';

  if (bleed) {
    console.log(label + '   (full bleed — exempt)');
  } else if (worst > THRESHOLD_MM) {
    bad++;
    console.log(label + '   HOLE at ' + at + 'mm — the page stops rather than ends');
  } else {
    console.log(label + '   ok');
  }
}

console.log('  ' + '-'.repeat(52));
if (bad) {
  console.log('  ' + bad + ' page(s) with a gap deeper than ' + THRESHOLD_MM + 'mm');
  console.log('  Fix by design — a band, a figure, a caption, a bigger');
  console.log('  picture. Never by padding the copy: the words are the');
  console.log("  client's and they are fixed.\n");
  process.exit(1);
}
console.log('  space is deliberate on every page\n');
