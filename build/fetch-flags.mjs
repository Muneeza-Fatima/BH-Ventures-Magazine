/* ============================================================
   fetch-flags.mjs — national flags for the Where We Operate map.

   Flags come from Wikimedia Commons as SVG, so they stay sharp at
   any size and carry no licence conditions: a national flag is a
   government insignia and Commons hosts these as public domain.

   They are fetched rather than drawn. A hand-drawn flag is always
   subtly wrong — the wrong ratio, the wrong shade of red, the
   crescent at the wrong angle — and a reader from that country
   notices immediately. In a magazine that lists these as its
   markets, getting a flag wrong would be worse than having none.

   Each is normalised to a common height so the row reads evenly,
   and given a hairline border, because Denmark's and Ukraine's
   flags both run to white or pale at the edge and would otherwise
   dissolve into the page.

   Usage: node build/fetch-flags.mjs
   ============================================================ */

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'assets/flags');
mkdirSync(OUT, { recursive: true });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const API = 'https://api.wikimedia.org/core/v1/commons';

/* slug -> the Commons file. Order follows the magazine: direct
   operations, then strategic partnerships, then wider network. */
const FLAGS = [
  ['ae', 'File:Flag of the United Arab Emirates.svg', 'United Arab Emirates'],
  ['pk', 'File:Flag of Pakistan.svg', 'Pakistan'],
  ['gb', 'File:Flag of the United Kingdom.svg', 'United Kingdom'],
  ['us', 'File:Flag of the United States.svg', 'United States'],
  ['fr', 'File:Flag of France.svg', 'France'],
  ['de', 'File:Flag of Germany.svg', 'Germany'],
  ['ee', 'File:Flag of Estonia.svg', 'Estonia'],
  ['dk', 'File:Flag of Denmark.svg', 'Denmark'],
  ['ua', 'File:Flag of Ukraine.svg', 'Ukraine'],
  ['sa', 'File:Flag of Saudi Arabia.svg', 'Saudi Arabia'],
];

const curl = (url, out) =>
  execFileSync('curl', out ? ['-s', '-4', '-A', UA, '--max-time', '60', '-o', out, url] : ['-s', '-4', '-A', UA, '--max-time', '60', url], {
    encoding: out ? 'buffer' : 'utf8',
    maxBuffer: 1 << 26,
  });

const jget = (url) => {
  try {
    return JSON.parse(curl(url));
  } catch {
    return null;
  }
};

const manifest = [];

for (const [slug, key, name] of FLAGS) {
  const meta = jget(API + '/file/' + encodeURIComponent(key));
  const url = meta?.original?.url;
  if (!url) {
    console.log('X  ' + slug + '  ' + name + ' - not found');
    continue;
  }

  const dest = resolve(OUT, slug + '.svg');

  /* upload.wikimedia.org rate-limits a burst of requests and answers
     with an HTML error page rather than an error status, so a naive
     fetch writes the error page into the .svg and only fails later,
     on the page, as a missing flag. Check the bytes, wait, retry. */
  let body = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    curl(url, dest);
    body = readFileSync(dest, 'utf8');
    if (/<svg[\s>]/i.test(body)) break;
    const wait = attempt * 1500;
    console.log('   ' + slug + ' rate-limited, retrying in ' + wait + 'ms');
    execFileSync(process.execPath, ['-e', 'setTimeout(()=>{}, ' + wait + ')']);
  }

  if (!/<svg[\s>]/i.test(body)) {
    console.log('X  ' + slug + '  ' + name + ' - could not fetch');
    continue;
  }

  /* Read the intrinsic ratio so the page can size every flag to one
     height without squashing any of them. The ratios genuinely differ
     — 2:3, 1:2, 3:5, and Denmark's 28:37 — and some files carry
     width/height instead of a viewBox. */
  let ratio = null;
  const vb = /viewBox\s*=\s*"([-\d.\s]+)"/i.exec(body);
  if (vb) {
    const [, , w, h] = vb[1].trim().split(/\s+/).map(Number);
    if (w && h) ratio = +(w / h).toFixed(4);
  }
  if (!ratio) {
    const w = parseFloat(/\bwidth\s*=\s*"([\d.]+)/i.exec(body)?.[1] ?? '');
    const h = parseFloat(/\bheight\s*=\s*"([\d.]+)/i.exec(body)?.[1] ?? '');
    if (w && h) ratio = +(w / h).toFixed(4);
  }

  execFileSync(process.execPath, ['-e', 'setTimeout(()=>{}, 700)']);  // pace, so the limiter is not tripped
  manifest.push({ slug, name, ratio, source: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(key) });
  console.log(
    'OK ' + slug + '  ' + name.padEnd(22) + String(Math.round(statSync(dest).size / 1024)).padStart(4) + 'KB  ratio ' + (ratio ?? '?'),
  );
}

writeFileSync(resolve(OUT, 'flags.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('\nwrote assets/flags/flags.json (' + manifest.length + ' flags)');
