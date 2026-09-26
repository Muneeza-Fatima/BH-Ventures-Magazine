/* ============================================================
   make-map.mjs — generates assets/graphics/world-map.svg

   The first version of this page was a radial diagram centred on
   Dubai. The client asked for an actual world map, so this is a
   world map.

   The source is File:BlankMap-World-Equirectangular.svg from
   Wikimedia Commons, PD-USGov-CIA-WF — public domain, no licence
   conditions at all, and vector, so it stays sharp at any size.

   The useful thing about that file is that every country is a
   group carrying its ISO 3166-1 alpha-2 code as its id. So the
   nine markets are not plotted as dots guessed from a projection
   — the actual countries are filled. That is both more accurate
   and much better looking than markers on an outline.

   It also sidesteps a real problem: the file's aspect is 1.79,
   not the 2.0 a full plate-carrée would be, so it is cropped and
   its latitude range cannot be assumed. Using the country
   geometry directly means no projection maths is needed anywhere.

   Run: node build/make-map.mjs
   ============================================================ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'assets/graphics/world-raw.svg');
const OUT = resolve(ROOT, 'assets/graphics/world-map.svg');

if (!existsSync(SRC)) {
  console.error('make-map: assets/graphics/world-raw.svg is missing.');
  console.error('  curl -sL -o assets/graphics/world-raw.svg \\');
  console.error('    https://upload.wikimedia.org/wikipedia/commons/9/9f/BlankMap-World-Equirectangular.svg');
  process.exit(2);
}

const svg = readFileSync(SRC, 'utf8');

/* --- the markets ------------------------------------------- */

const DIRECT = ['ae', 'pk', 'gb', 'us', 'fr'];
const PARTNER = ['de', 'ee', 'dk', 'ua'];
const WIDER = ['sa'];
const OURS = [...DIRECT, ...PARTNER, ...WIDER];

/* France, in this dataset, includes French Guiana, Réunion and the
   Caribbean départements. They are legally France, but highlighting
   a patch of South America on a map of a Dubai company's markets
   reads as a mistake, not as a fact — and the French operation is in
   Paris. So France is clipped to Europe.

   The United States deliberately is not clipped: Alaska and Hawaii
   read as part of the country, and removing them would look like the
   map was broken rather than edited. */
const CLIP = {
  fr: { x0: 1180, y0: 330, x1: 1420, y1: 470 },
};

const withinClip = (id, d) => {
  const box = CLIP[id];
  if (!box) return true;
  const n = d.match(/-?\d+(?:\.\d+)?/g);
  if (!n) return false;
  let sx = 0, sy = 0, count = 0;
  for (let i = 0; i + 1 < n.length; i += 2) {
    sx += +n[i];
    sy += +n[i + 1];
    count++;
  }
  const cx = sx / count;
  const cy = sy / count;
  return cx >= box.x0 && cx <= box.x1 && cy >= box.y0 && cy <= box.y1;
};

/* --- pull every country group out of the source -------------- */

/** @type {Map<string, {d: string[], box: {x0:number,y0:number,x1:number,y1:number}}>} */
const countries = new Map();

/* The source is not consistent about how a country is expressed:
   most are <g id="xx"> holding several paths (islands, exclaves),
   but some — Pakistan and Ukraine among them — are a single
   <path id="xx">. Reading only the groups silently dropped those
   two, which is the kind of omission nobody notices until a reader
   from that country does. Both forms are handled. */

const bodies = new Map(); // id -> markup to scan for d attributes

// 1. single-path countries
for (const m of svg.matchAll(/<path\b[^>]*\bid="([a-z]{2})"[^>]*\/?>/g)) {
  bodies.set(m[1], m[0]);
}

// 2. grouped countries, scanning for the matching close tag so a
//    nested <g> cannot end the group early
for (const m of svg.matchAll(/<g\b[^>]*\bid="([a-z]{2})"[^>]*>/g)) {
  const id = m[1];
  let i = m.index + m[0].length;
  let depth = 1;
  const tagRe = /<\/?g\b/g;
  tagRe.lastIndex = i;
  let t;
  while (depth > 0 && (t = tagRe.exec(svg)) !== null) {
    depth += t[0] === '</g' ? -1 : 1;
    i = t.index + t[0].length;
  }
  bodies.set(id, svg.slice(m.index, i));
}

for (const [id, body] of bodies) {
  const ds = [...body.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]).filter((d) => withinClip(id, d));
  if (!ds.length) continue;

  /* Paths here use absolute commands throughout, so the numbers in
     the d attribute are page coordinates. Bezier control points can
     sit slightly outside the drawn shape, which makes this bounding
     box a shade generous — fine for placing a marker, and we are not
     using it for anything that needs to be exact. */
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of ds) {
    const nums = d.match(/-?\d+(?:\.\d+)?/g);
    if (!nums) continue;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = +nums[i];
      const y = +nums[i + 1];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  countries.set(id, { d: ds, box: { x0, y0, x1, y1 } });
}

/* --- crop -------------------------------------------------
   Antarctica is a wide white band across the bottom that no
   reader needs and that would otherwise eat a third of the page.
   Drop it, and trim to what is left. */

const keep = [...countries.entries()].filter(([id]) => id !== 'aq');

let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
for (const [, c] of keep) {
  X0 = Math.min(X0, c.box.x0);
  Y0 = Math.min(Y0, c.box.y0);
  X1 = Math.max(X1, c.box.x1);
  Y1 = Math.max(Y1, c.box.y1);
}

const pad = 14;
X0 -= pad; Y0 -= pad; X1 += pad; Y1 += pad;
const W = X1 - X0;
const H = Y1 - Y0;

/* --- draw --------------------------------------------------- */

const f = (n) => Number(n.toFixed(2));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const layer = (ids, cls) =>
  keep
    .filter(([id]) => ids.includes(id))
    .map(([id, c]) => `    <g class="${cls}" id="c-${id}">` + c.d.map((d) => `<path d="${d}"/>`).join('') + '</g>')
    .join('\n');

const base = keep
  .filter(([id]) => !OURS.includes(id))
  .map(([, c]) => c.d.map((d) => `<path d="${d}"/>`).join(''))
  .join('');

/* Markers sit at the centre of each country's box. For the big
   sprawling ones that is not where a person would point, but it is
   honest — the marker means "this country", not "this city". Dubai
   is the exception and gets its own precise treatment. */
const marker = (id, cls) => {
  const c = countries.get(id);
  if (!c) return '';
  const cx = (c.box.x0 + c.box.x1) / 2;
  const cy = (c.box.y0 + c.box.y1) / 2;
  return `    <circle class="${cls}" cx="${f(cx)}" cy="${f(cy)}" r="7"/>`;
};

const ae = countries.get('ae').box;
const dubaiX = (ae.x0 + ae.x1) / 2;
const dubaiY = (ae.y0 + ae.y1) / 2;

const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(X0)} ${f(Y0)} ${f(W)} ${f(H)}" role="img" aria-label="World map with BH Ventures markets highlighted">
  <title>BH Ventures markets</title>
  <style>
    /* The first version drew land at #E6E4DE on #FAFAF8 paper.
       Those are nearly the same value, so the continents dissolved
       and only the highlighted markets showed — the client's note
       that the map "is white in places".

       Land cannot read against nothing; it reads against sea. So
       the map now has a sea, the land is a cool grey-blue that
       separates from both sea and paper, and every coast carries a
       hairline. That last one is what makes continents look drawn
       rather than smudged. */
    .sea      { fill: #F4F5F2; }
    .land     { fill: #C6D0D2; stroke: #185D58; stroke-width: 0.8; stroke-opacity: .35; stroke-linejoin: round; }
    .direct   { fill: #185D58; stroke: #123F3C; stroke-width: 0.8; stroke-linejoin: round; }
    .partner  { fill: #7FB3AD; stroke: #185D58; stroke-width: 0.8; stroke-opacity: .55; stroke-linejoin: round; }
    .wider    { fill: #B9CFCB; stroke: #185D58; stroke-width: 0.8; stroke-opacity: .45; stroke-linejoin: round; }
    .pin      { fill: #0B8F81; }
    .pin-dir  { fill: #185D58; }
    .origin   { fill: #0B8F81; }
    .ring     { fill: none; stroke: #0B8F81; stroke-width: 2.4; }
    .ring-2   { fill: none; stroke: #0B8F81; stroke-width: 1.8; opacity: .45; }
  </style>

  <rect class="sea" x="${f(X0)}" y="${f(Y0)}" width="${f(W)}" height="${f(H)}"/>

  <g class="land">${base}</g>

${layer(WIDER, 'wider')}
${layer(PARTNER, 'partner')}
${layer(DIRECT, 'direct')}

  <g id="origin">
    <circle class="ring-2" cx="${f(dubaiX)}" cy="${f(dubaiY)}" r="42"/>
    <circle class="ring"   cx="${f(dubaiX)}" cy="${f(dubaiY)}" r="24"/>
    <circle class="origin" cx="${f(dubaiX)}" cy="${f(dubaiY)}" r="8"/>
  </g>
</svg>
`;

writeFileSync(OUT, out);

const kb = (out.length / 1024).toFixed(0);
console.log('wrote assets/graphics/world-map.svg  (' + kb + 'KB, viewBox ' + f(W) + '×' + f(H) + ')');
console.log('');
console.log('  highlighted   ' + OURS.length + ' countries');
console.log('  direct        ' + DIRECT.join(' ').toUpperCase());
console.log('  partnerships  ' + PARTNER.join(' ').toUpperCase());
console.log('  wider         ' + WIDER.join(' ').toUpperCase());

const missing = OURS.filter((id) => !countries.has(id));
if (missing.length) console.log('\n!  not present in the source map: ' + missing.join(', '));
