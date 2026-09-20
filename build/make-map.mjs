/* ============================================================
   make-map.mjs — generates assets/graphics/network-map.svg

   This is the magazine's most ambitious graphic, so it is worth
   saying what it is and is not.

   It is NOT a decorative globe with dots on it. It is an
   azimuthal projection centred on Dubai: every market sits at its
   true compass bearing from the BH Ventures office, and its
   distance ring is its real great-circle distance. Dubai is
   literally the centre of the drawing, which is the company's own
   sentence — "from a single address in Dubai" — stated as
   geometry instead of as a claim.

   The radial scale is compressed (square root) so that Pakistan at
   1,400km and Washington at 11,000km can share one page without
   the near markets collapsing into the centre. That compression is
   not hidden: the rings carry their real distances, so the reader
   can see exactly what the scale is doing.

   Run: node build/make-map.mjs
   ============================================================ */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(ROOT, 'assets/graphics'), { recursive: true });

const ORIGIN = { name: 'Dubai', lat: 25.2048, lon: 55.2708, label: '25°12′N 55°16′E' };

const MARKETS = [
  // Direct operations — filled nodes
  { name: 'United Arab Emirates', short: 'UAE', lat: 25.2048, lon: 55.2708, coords: '25°12′N 55°16′E', kind: 'direct', origin: true },
  { name: 'Pakistan', short: 'Pakistan', lat: 30.3753, lon: 69.3451, coords: '30°22′N 69°21′E', kind: 'direct' },
  { name: 'United Kingdom', short: 'United Kingdom', lat: 51.5072, lon: -0.1276, coords: '51°30′N 00°07′W', kind: 'direct' },
  { name: 'United States', short: 'United States', lat: 38.9072, lon: -77.0369, coords: '38°54′N 77°02′W', kind: 'direct' },
  { name: 'France', short: 'France', lat: 48.8566, lon: 2.3522, coords: '48°51′N 02°21′E', kind: 'direct' },
  // Strategic partnerships — hollow rings
  { name: 'Germany', short: 'Germany', lat: 52.52, lon: 13.405, coords: '52°31′N 13°24′E', kind: 'partner' },
  { name: 'Estonia', short: 'Estonia', lat: 59.437, lon: 24.7536, coords: '59°26′N 24°45′E', kind: 'partner' },
  { name: 'Denmark', short: 'Denmark', lat: 55.6761, lon: 12.5683, coords: '55°40′N 12°34′E', kind: 'partner' },
  { name: 'Ukraine', short: 'Ukraine', lat: 50.4501, lon: 30.5234, coords: '50°27′N 30°31′E', kind: 'partner' },
  // Wider network
  { name: 'Saudi Arabia', short: 'Saudi Arabia', lat: 24.7136, lon: 46.6753, coords: '24°42′N 46°41′E', kind: 'wider' },
];

const R_EARTH = 6371;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function greatCircle(a, b) {
  const p1 = rad(a.lat);
  const p2 = rad(b.lat);
  const dl = rad(b.lon - a.lon);
  const dp = p2 - p1;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearing(a, b) {
  const p1 = rad(a.lat);
  const p2 = rad(b.lat);
  const dl = rad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/* Canvas.

   Two things the first draft got wrong, both visible the moment
   it was rendered:

   1. Seven of the nine markets sit between bearing 314 and 336 —
      they really are almost all north-west of Dubai. Plotted
      truthfully, their labels land on top of each other. So the
      DOTS keep their true positions and the LABELS move out to a
      ruled column, joined by leader lines. That is what a
      technical drawing does, and it moves nothing that carries
      data.

   2. Nothing at all lies south of Dubai, so a full circle left
      the bottom half of the page empty. The canvas is cropped to
      the arc that actually carries markets. Empty space that
      means something is composition; empty space that means
      nothing is just a hole. */
const W = 900;
const H = 780;
const CX = 430;
const CY = 545;
const R_MAX = 330;
const D_MAX = 12000; // km at the outer ring
const rOf = (km) => Math.sqrt(Math.min(km, D_MAX) / D_MAX) * R_MAX;

const LABEL_GAP = 46;  // minimum vertical space between stacked labels
const LEFT_X = 14;
const RIGHT_X = W - 14;

const RINGS = [1000, 3000, 6000, 12000];

const nodes = MARKETS.map((m) => {
  const km = m.origin ? 0 : greatCircle(ORIGIN, m);
  const brg = m.origin ? 0 : bearing(ORIGIN, m);
  const r = rOf(km);
  // Screen angle: 0deg bearing is north, which is -90deg in SVG.
  const a = rad(brg - 90);
  return { ...m, km, brg, x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
});

const f = (n) => n.toFixed(1);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* --- arcs ---------------------------------------------------
   Each connection bows slightly, the way a route drawn on a
   sphere does. The bow is perpendicular to the chord and scales
   with length, so short hops stay nearly straight. */
const arcs = nodes
  .filter((n) => !n.origin)
  .map((n) => {
    const dx = n.x - CX;
    const dy = n.y - CY;
    const len = Math.hypot(dx, dy);
    const bow = len * 0.16;
    const mx = CX + dx / 2 - (dy / len) * bow;
    const my = CY + dy / 2 + (dx / len) * bow;
    const stroke = n.kind === 'direct' ? 'var(--aqua, #2DD4C0)' : 'var(--teal, #0B8F81)';
    const dash = n.kind === 'direct' ? '' : ' stroke-dasharray="3 4"';
    const op = n.kind === 'direct' ? 0.55 : 0.4;
    return `    <path d="M${f(CX)} ${f(CY)} Q${f(mx)} ${f(my)} ${f(n.x)} ${f(n.y)}" fill="none" stroke="${stroke}" stroke-width="1"${dash} opacity="${op}"/>`;
  })
  .join('\n');

/* --- distance rings ---------------------------------------- */
const rings = RINGS.map((km) => {
  const r = rOf(km);
  return `    <circle cx="${CX}" cy="${CY}" r="${f(r)}" fill="none" stroke="#2DD4C0" stroke-width="0.75" opacity="0.16"/>
    <text x="${CX + 4}" y="${f(CY - r - 5)}" class="ring-label">${km.toLocaleString('en-US')} KM</text>`;
}).join('\n');

/* --- bearing spokes every 30 degrees ------------------------ */
const spokes = Array.from({ length: 12 }, (_, i) => {
  const a = rad(i * 30 - 90);
  const r0 = rOf(600);
  const r1 = R_MAX;
  return `    <line x1="${f(CX + r0 * Math.cos(a))}" y1="${f(CY + r0 * Math.sin(a))}" x2="${f(CX + r1 * Math.cos(a))}" y2="${f(CY + r1 * Math.sin(a))}" stroke="#2DD4C0" stroke-width="0.5" opacity="0.08"/>`;
}).join('\n');

/* --- label ladder --------------------------------------------
   Each label is pushed out to a column and given a y-slot that
   cannot collide with its neighbours. The dot never moves; only
   the label does, and a leader line keeps the two tied together
   so nothing about the data is obscured. */
function ladder(list, side) {
  const col = list.slice().sort((a, b) => a.y - b.y);
  let last = -Infinity;
  for (const n of col) {
    n.ly = Math.max(n.y, last + LABEL_GAP);
    last = n.ly;
  }
  // If the stack overflowed the canvas, lift the whole column.
  const overflow = last - (H - 150);
  if (overflow > 0) for (const n of col) n.ly -= overflow;
  for (const n of col) n.side = side;
  return col;
}

const placed = nodes.filter((n) => !n.origin);
ladder(placed.filter((n) => n.x < CX), 'left');
ladder(placed.filter((n) => n.x >= CX), 'right');

const marks = [
  `    <g>
      <circle cx="${CX}" cy="${CY}" r="26" fill="none" stroke="#2DD4C0" stroke-width="0.75" opacity="0.35"/>
      <circle cx="${CX}" cy="${CY}" r="15" fill="none" stroke="#2DD4C0" stroke-width="0.75" opacity="0.7"/>
      <circle cx="${CX}" cy="${CY}" r="4.5" fill="#2DD4C0"/>
      <text x="${CX}" y="${CY + 48}" text-anchor="middle" class="origin-name">DUBAI</text>
      <text x="${CX}" y="${CY + 62}" text-anchor="middle" class="node-coord">${esc(ORIGIN.label)}</text>
    </g>`,
  ...placed.map((n) => {
    const left = n.side === 'left';
    const lx = left ? LEFT_X : RIGHT_X;
    const anchor = left ? 'start' : 'end';
    const elbow = left ? lx + 116 : lx - 116;

    const dot =
      n.kind === 'direct'
        ? `<circle cx="${f(n.x)}" cy="${f(n.y)}" r="4" fill="#2DD4C0"/>`
        : `<circle cx="${f(n.x)}" cy="${f(n.y)}" r="4" fill="none" stroke="#0B8F81" stroke-width="1.2"/>`;

    return `    <g>
      <path d="M${f(n.x)} ${f(n.y)} L${f(elbow)} ${f(n.ly - 4)} L${f(left ? elbow + 8 : elbow - 8)} ${f(n.ly - 4)}" fill="none" stroke="#2DD4C0" stroke-width="0.5" opacity="0.3"/>
      ${dot}
      <text x="${lx}" y="${f(n.ly - 6)}" text-anchor="${anchor}" class="node-name ${n.kind}">${esc(n.short.toUpperCase())}</text>
      <text x="${lx}" y="${f(n.ly + 6)}" text-anchor="${anchor}" class="node-coord">${esc(n.coords)} &#183; ${Math.round(n.km).toLocaleString('en-US')} KM</text>
    </g>`;
  }),
].join('\n');

const TOP = 165;   // everything above the outer ring is empty, so crop it away
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${TOP} ${W} ${H - TOP}" width="${W}" height="${H - TOP}" role="img" aria-label="Network of BH Ventures markets, plotted by true bearing and distance from Dubai">
  <title>Markets by bearing and distance from Dubai</title>
  <style>
    .ring-label { font-family: "Space Grotesk", sans-serif; font-size: 9px; letter-spacing: .16em; fill: #2DD4C0; opacity: .34; }
    .node-name  { font-family: "Space Grotesk", sans-serif; font-size: 12px; letter-spacing: .14em; fill: #FAFAF8; }
    .node-name.partner { fill: #8FA3B5; }
    .node-coord { font-family: "Space Grotesk", sans-serif; font-size: 8px;  letter-spacing: .10em; fill: #2DD4C0; opacity: .7; }
    .legend     { font-family: "Space Grotesk", sans-serif; font-size: 9px;  letter-spacing: .16em; fill: #8FA3B5; }
    .legend-n   { font-family: "Space Grotesk", sans-serif; font-size: 9px;  letter-spacing: .16em; fill: #2DD4C0; }
    .origin-name{ font-family: "Space Grotesk", sans-serif; font-size: 13px; letter-spacing: .2em; fill: #FAFAF8; }
    .cardinal   { font-family: "Space Grotesk", sans-serif; font-size: 9px;  letter-spacing: .2em;  fill: #2DD4C0; opacity: .3; }
  </style>

  <g id="spokes">
${spokes}
  </g>

  <g id="rings">
${rings}
  </g>

  <g id="cardinals">
    <text x="${CX}" y="${CY - R_MAX - 20}" text-anchor="middle" class="cardinal">N</text>
  </g>

  <g id="arcs">
${arcs}
  </g>

  <g id="nodes">
${marks}
  </g>

  <g id="legend" transform="translate(0 ${H - 84})">
    <line x1="0" y1="0" x2="${W}" y2="0" stroke="#2DD4C0" stroke-width="0.6" opacity="0.22"/>
    <circle cx="8" cy="26" r="4" fill="#2DD4C0"/>
    <text x="22" y="30" class="legend-n">DIRECT OPERATIONS</text>
    <text x="196" y="30" class="legend">5</text>

    <circle cx="8" cy="52" r="4" fill="none" stroke="#0B8F81" stroke-width="1.2"/>
    <text x="22" y="56" class="legend">STRATEGIC PARTNERSHIPS</text>
    <text x="252" y="56" class="legend">4</text>

    <text x="380" y="30" class="legend">PLOTTED BY TRUE BEARING FROM DUBAI</text>
    <text x="380" y="56" class="legend">RINGS ARE GREAT-CIRCLE DISTANCE</text>
  </g>
</svg>
`;

const out = resolve(ROOT, 'assets/graphics/network-map.svg');
writeFileSync(out, svg);

console.log('wrote assets/graphics/network-map.svg');
console.log('');
console.log('  market            bearing   distance');
console.log('  ' + '-'.repeat(42));
for (const n of nodes) {
  if (n.origin) continue;
  console.log(
    '  ' + n.short.padEnd(18) + (n.brg.toFixed(0) + '°').padStart(6) + '   ' + Math.round(n.km).toLocaleString('en-US').padStart(7) + ' km',
  );
}
