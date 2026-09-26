/* ============================================================
   fetch-images.mjs — source the photography from Wikimedia Commons.

   Why Commons, not a stock site: Unsplash and Pexels both bot-block
   this machine, and the CC pool on Flickr tops out at 1024px, which
   is about 120dpi across an A4 page. Commons serves originals in the
   3000-6000px range, which is what a 300dpi full-bleed page needs.

   Why curl, not fetch(): node's fetch resolves these hosts over IPv6
   first here and times out. curl -4 is reliable.

   LICENSING — this is a commercial magazine that gets printed and
   distributed, and every photo is cropped and colour graded, which
   makes it a derivative work. So we accept only:

     CC0 / Public Domain    no conditions
     CC BY                  attribution only
     Unsplash on Commons    Commons hosts only the pre-2017 CC0 ones

   and reject SA (share-alike would reach the adapted photo), ND
   (forbids derivatives, and we crop) and NC (forbids commercial use,
   which is exactly what this is).

   Usage: node build/fetch-images.mjs [slug ...] [--list]
   ============================================================ */

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, statSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(ROOT, 'assets/images/raw');
mkdirSync(RAW, { recursive: true });

const UA = 'BHVenturesMagazine/1.0 (editorial layout)';
const API = 'https://api.wikimedia.org/core/v1/commons';
const MIN_W = 2200; // 300dpi across the text column, with room to crop

/* Licence templates on Commons usually hide the real licence inside a
   parameter - {{self|cc-by-sa-4.0}} - so reading the template NAME
   finds "self" and tells us nothing. Scan the whole wikitext instead,
   and let a single SA / ND / NC token disqualify the file. */
function classify(src) {
  const has = (re) => re.test(src);

  if (has(/cc[-_ ]?by[-_ ]?sa/i) || has(/share[-_ ]?alike/i)) return null;
  if (has(/cc[-_ ]?by[-_ ]?nd/i) || has(/no[-_ ]?derivat/i)) return null;
  if (has(/cc[-_ ]?by[-_ ]?nc/i) || has(/noncommercial/i)) return null;

  const by = /cc[-_ ]?by[-_ ]?(\d\.\d)/i.exec(src);
  if (by) return 'CC BY ' + by[1];
  if (has(/\{\{\s*cc[-_ ]?zero\s*[|}]/i) || has(/\bCC0\b/)) return 'CC0';
  if (has(/\{\{\s*Unsplash\s*[|}]/i)) return 'Unsplash (CC0)';
  const pd = /\{\{\s*(PD[-\w]*|Public[ -]?[Dd]omain[-\w]*)\s*[|}]/.exec(src);
  if (pd) return pd[1].replace(/_/g, ' ');
  return null;
}

/* Resolution is matched to placement, not maximised blindly.

   A full-bleed A4 page at 300dpi needs ~2500px across. A venture
   card is 55mm wide, which at 300dpi is only ~650px — so a 1024px
   source is genuinely enough there, and insisting on 2200px would
   reject perfectly good photographs for no gain.

   That matters because the CC0/CC-BY pool for modern commercial
   imagery is thin. Commons has the high-resolution material;
   Openverse has far more choice but tops out around 1024px. So we
   try Commons first, then fall back to Openverse for the small
   placements only. */
const FULL_BLEED = 2200;
const CARD = 950;

const SHOTS = [
  /* The cover. A CUT-OUT, so the sky matters as much as the
     buildings: it has to be clear and even, because grade-images.mjs
     keys it out and a mottled or hazy sky leaves a ragged edge.
     Queries are ordered widest-net first. */
  { slug: 'cover-dubai-real', minW: 3000, queries: ['Downtown Dubai skyline', 'Burj Khalifa Downtown Dubai', 'Dubai skyline day', 'Sheikh Zayed Road skyline', 'Burj Khalifa daytime'] },
  { slug: 'cover-dubai-skyline', minW: FULL_BLEED, queries: ['Dubai skyline night', 'Dubai Downtown skyline', 'Burj Khalifa night'] },
  { slug: 'opening-dubai-road', minW: FULL_BLEED, queries: ['Sheikh Zayed Road', 'Dubai skyline day', 'Dubai Business Bay', 'Dubai cityscape'] },
  { slug: 'connections-port', minW: FULL_BLEED, queries: ['container terminal', 'container ship port', 'Hamburg container terminal', 'port of Rotterdam containers'] },
  { slug: 'future-construction', minW: FULL_BLEED, queries: ['tower crane construction', 'skyscraper construction', 'building under construction'] },
  { slug: 'build-dubai-marina', minW: FULL_BLEED, queries: ['Dubai Marina', 'Dubai aerial', 'Palm Jumeirah', 'Burj Al Arab'] },

  /* The venture photographs are deliberately architectural and
     industrial rather than literal. Two reasons:

     1. Editorially, "people smiling at a laptop" is the dullest
        corporate cliché there is. Infrastructure carries the
        company's own language — trade, ports, data, buildings —
        far better than a posed desk.
     2. Practically, the CC0/CC-BY pool for staged business photos
        is thin and dated, while its coverage of ports, data
        centres and architecture is excellent and high resolution.

     Also avoid frames with legible third-party branding: another
     company's logo in a BH Ventures magazine implies a
     relationship that does not exist. */
  { slug: 'ventures-automobile', minW: CARD, queries: ['car carrier ship', 'vehicle carrier vessel port', 'roro vessel'], ov: ['car carrier ship', 'vehicle export port'] },
  { slug: 'ventures-foodstuff', minW: CARD, queries: ['reefer containers stacked', 'warehouse pallets', 'cargo hold containers'], ov: ['warehouse pallets logistics', 'cargo warehouse'] },
  { slug: 'ventures-analytics', minW: CARD, queries: ['data center server room', 'server room racks', 'data centre interior'], ov: ['data center servers', 'server racks'] },
  { slug: 'ventures-workspace', minW: CARD, queries: ['atrium modern architecture', 'modern building interior', 'glass facade interior'], ov: ['modern architecture interior', 'glass atrium'] },
  { slug: 'ventures-exhibition', minW: CARD, queries: ['exhibition hall interior', 'convention centre hall', 'congress centre interior'], ov: ['exhibition hall', 'convention centre'] },
];

const sh = (url) =>
  execFileSync('curl', ['-s', '-4', '-A', UA, '--max-time', '60', url], {
    maxBuffer: 1 << 26,
    encoding: 'utf8',
  });

const jget = (url) => {
  try {
    return JSON.parse(sh(url));
  } catch {
    return null;
  }
};

function licenceOf(title) {
  const src = jget(API + '/page/' + encodeURIComponent(title))?.source ?? '';
  const raw = (/\|\s*[Aa]uthor\s*=\s*(.+)/.exec(src) ?? [])[1] ?? '';
  const author = raw
    .replace(/\[\[[^|\]]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\{\{\s*(?:User|u|Creator):?[^|}]*\|?/gi, '')
    .replace(/\[\[|\]\]|\{\{|\}\}/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\|.*$/, '')
    .trim()
    .slice(0, 60);
  return { licence: classify(src), author: author || 'Unknown' };
}

/* Openverse fallback. Its own licence filter does the SA/ND/NC
   exclusion for us, so we ask it only for cc0, pdm and by. */
function fromOpenverse(shot) {
  for (const q of shot.ov ?? []) {
    const url =
      'https://api.openverse.org/v1/images/?q=' +
      encodeURIComponent(q) +
      '&license=cc0,pdm,by&page_size=20&mature=false';
    const results = jget(url)?.results ?? [];
    const best = results
      .filter((r) => (r.width ?? 0) >= shot.minW)
      .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
    if (best) {
      return {
        key: best.title ?? q,
        url: best.url,
        w: best.width,
        h: best.height,
        licence: 'CC ' + String(best.license).toUpperCase() + ' ' + (best.license_version ?? ''),
        author: best.creator ?? 'Unknown',
        source: best.foreign_landing_url ?? best.url,
      };
    }
  }
  return null;
}

const listOnly = process.argv.includes('--list');
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const list = wanted.length ? SHOTS.filter((s) => wanted.includes(s.slug)) : SHOTS;
const credits = [];

for (const shot of list) {
  const dest = resolve(RAW, shot.slug + '.jpg');
  const already = ['.jpg', '.webp', '.png'].map((e) => resolve(RAW, shot.slug + e)).find(existsSync);
  if (already && !listOnly) {
    console.log('-  ' + shot.slug + ' already present, skipping');
    continue;
  }

  let picked = null;
  for (const q of shot.queries) {
    const hits = jget(API + '/search/page?q=' + encodeURIComponent(q) + '&limit=12')?.pages ?? [];
    for (const h of hits) {
      if (!/\.jpe?g$/i.test(h.key)) continue;
      const orig = jget(API + '/file/' + encodeURIComponent(h.key))?.original;
      if (!orig || orig.width < shot.minW) continue;
      const { licence, author } = licenceOf(h.key);
      if (!licence) continue;
      picked = {
        key: h.key,
        url: orig.url,
        w: orig.width,
        h: orig.height,
        licence,
        author,
        source: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(h.key),
      };
      break;
    }
    if (picked) break;
  }

  if (!picked) picked = fromOpenverse(shot);

  if (!picked) {
    console.log('X  ' + shot.slug + ' - nothing usable found');
    continue;
  }

  const name = picked.key.replace(/^File:/, '').slice(0, 42);
  const label = String(picked.w) + 'x' + picked.h + '  ' + picked.licence.padEnd(15) + name;
  if (listOnly) {
    console.log('?  ' + shot.slug.padEnd(22) + label);
    continue;
  }

  execFileSync('curl', ['-s', '-4', '-A', UA, '--max-time', '240', '-o', dest, picked.url]);

  /* Openverse hands back WebP behind a .jpg URL often enough that
     naming the file by its URL is a lie. sharp reads it either way,
     but a raw asset whose extension does not match its bytes is a
     trap for whoever opens the folder next. */
  const head = readFileSync(dest, { length: 16 });
  const real =
    head[0] === 0xff && head[1] === 0xd8 ? 'jpg'
    : head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP' ? 'webp'
    : head.toString('latin1', 1, 4) === 'PNG' ? 'png'
    : null;

  if (!real) {
    unlinkSync(dest);
    console.log('X  ' + shot.slug + ' - download was not an image, discarded');
    continue;
  }
  let file = dest;
  if (real !== 'jpg') {
    file = resolve(RAW, shot.slug + '.' + real);
    renameSync(dest, file);
  }

  console.log('OK ' + shot.slug.padEnd(22) + label + '  ' + real + '  ' + (statSync(file).size / 1048576).toFixed(1) + 'MB');

  credits.push({
    slug: shot.slug,
    title: picked.key.replace(/^File:/, ''),
    author: picked.author,
    licence: picked.licence.trim(),
    source: picked.source,
  });
}

if (credits.length) {
  const rows = credits.map(
    (c) => '| `' + c.slug + '` | ' + c.title + ' | ' + c.author + ' | ' + c.licence + ' | [source](' + c.source + ') |',
  );
  writeFileSync(
    resolve(ROOT, 'CREDITS.md'),
    [
      '# Image Credits',
      '',
      'Every photograph is used under a licence that permits commercial use **and** derivative',
      'works, because each one is cropped and colour graded for the page. CC BY-SA, CC BY-ND',
      'and CC BY-NC images are deliberately excluded - see `build/fetch-images.mjs`.',
      '',
      '| Used as | File | Photographer | Licence | Source |',
      '| --- | --- | --- | --- | --- |',
      ...rows,
      '',
    ].join('\n'),
  );
  console.log('\nwrote CREDITS.md (' + credits.length + ' entries)');
}
