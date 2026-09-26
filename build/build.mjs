/* ============================================================
   build.mjs — inject content/copy.json into the HTML templates.

   The point of this step is that the client never edits HTML.
   All the words live in copy.json; the layout lives in the .html
   files; this joins them. Change a sentence, rebuild, and the PDF
   and the web edition both update without anyone touching design.

   It is a deliberately small templating language — four forms,
   about forty lines of code. Anything bigger would be a framework
   with opinions of its own.

     {{a.b.c}}            value, HTML-escaped
     {{&a.b.c}}           value, raw (only for copy that carries markup)
     {{#each a.b}}...{{/each}}
                          repeat, with {{.}} for the item itself,
                          {{x}} for its fields, {{@n}} for a
                          1-based zero-padded counter
     {{#if a.b}}...{{/if}}
                          include only when truthy

   {{#if}} and {{#each}} DO NOT NEST inside one another. Both match
   non-greedily, so an outer {{#if}} pairs with the first {{/if}} it
   finds - which is the inner one - and the outer tag survives into
   the output. Write sibling blocks instead; there has not yet been
   a page that genuinely needed nesting.

   It also refuses to finish quietly if the copy still contains an
   unresolved [X] placeholder — see the guard at the bottom.

   Usage: node build/build.mjs
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const copy = JSON.parse(readFileSync(resolve(ROOT, 'content/copy.json'), 'utf8'));

const esc = (v) =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dig = (ctx, path) => {
  // {{.}} and {{this}} are the current item itself.
  if (path === '.' || path === 'this') return ctx.$item;

  // {{@n}} / {{@index}} read the loop counters, which live on ctx.
  if (path.startsWith('@')) {
    return path
      .slice(1)
      .split('.')
      .reduce((o, k) => o?.[k], ctx);
  }

  // A leading dot means "a field of the current item" — {{.text}}.
  // Without stripping it, split('.') yields an empty first key and
  // the lookup silently returns undefined, which is how the concept
  // quotes and device names came out blank on the first build.
  const keys = path.replace(/^\./, '').split('.');

  const fromItem = keys.reduce((o, k) => o?.[k], ctx.$item);
  if (fromItem !== undefined) return fromItem;

  return keys.reduce((o, k) => o?.[k], ctx.$root);
};

function render(tpl, ctx) {
  // {{#each path}} ... {{/each}}  (innermost first, so nesting works)
  tpl = tpl.replace(/\{\{#each ([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, path, body) => {
    const list = dig(ctx, path);
    if (!Array.isArray(list)) return '';
    return list
      .map((item, i) =>
        render(body, { ...ctx, $item: item, index: i, n: String(i + 1).padStart(2, '0') }),
      )
      .join('');
  });

  // {{#if path}} ... {{/if}}
  tpl = tpl.replace(/\{\{#if ([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, path, body) => {
    const v = dig(ctx, path);
    return v && (!Array.isArray(v) || v.length) ? render(body, ctx) : '';
  });

  // {{&raw}} then {{escaped}}
  tpl = tpl.replace(/\{\{&\s*([\w.@]+)\s*\}\}/g, (_, p) => String(dig(ctx, p) ?? ''));
  tpl = tpl.replace(/\{\{\s*([\w.@]+)\s*\}\}/g, (m, p) => {
    const v = dig(ctx, p);
    return v === undefined || v === null ? '' : esc(v);
  });

  return tpl;
}

/* ---------- build ------------------------------------------ */

const OUT = resolve(ROOT, 'out/magazine');
mkdirSync(OUT, { recursive: true });

/* <!--#include path --> pulls a file in verbatim before templating.

   The icon sprite has to be inlined rather than referenced as
   <use href="icons.svg#id">: CSS cannot cross into an externally
   referenced SVG document, so `fill: none; stroke: currentColor`
   never reached the paths and every icon printed as a solid black
   blob. Inlined, the same rules apply normally. */
let src = readFileSync(resolve(ROOT, 'src/magazine.html'), 'utf8');
src = src.replace(/<!--#include\s+([^\s>]+)\s*-->/g, (_, p) =>
  readFileSync(resolve(ROOT, p), 'utf8'),
);

/* ---------- which photographs actually exist ----------------
   Every picture slot in the book names a slug, and the page is
   built to work either way: photograph if the file is there,
   designed icon plate or navy page if it is not.

   Deciding that HERE rather than in copy.json is what makes the
   handover work. The client drops a JPEG into
   assets/images/raw/, runs `npm run images:grade && npm run
   build`, and the picture appears with nothing else in the
   layout moving -- no JSON to edit, no flag to remember to
   flip, and no way for the book to ship with an empty frame. */
const graded = (slug) =>
  Boolean(slug) && existsSync(resolve(ROOT, 'assets/images/graded/' + slug + '@300.jpg'));

let have = 0;
for (const v of copy.s04.ventures) {
  v.has_image = graded(v.image);
  v.plate = !v.has_image;
  if (v.has_image) have++;
}

/* The four editorial pictures behave the same way. Two of them
   now sit in a rounded frame on a white page rather than bleeding
   off it, and an empty rounded frame is a grey box — so those two
   get an explicit plate flag, the same way a venture page does.
   The other two are full-bleed and fall back to a navy page,
   which needs no flag. */
copy.art = {};
for (const slug of ['company-portfolio', 'ventures-opener', 'connections-port', 'future-construction']) {
  copy.art[slug.replace(/-/g, '_')] = graded(slug) ? slug : null;
}
copy.art.connections_plate = !copy.art.connections_port;
copy.art.future_plate = !copy.art.future_construction;
/* ---------- THE COVER PICTURE -------------------------------
   The front is a PHOTOGRAPH behind the type: the navy block that
   used to sit under the masthead band is now a real Dubai frame,
   full bleed, with the headline and cover lines reversed out of
   it. See grade-images.mjs for why the cut-outs were retired -
   the short version is that they printed at about 90dpi and that
   only an AI render can give cutOut() the clean white ground it
   needs, so "cut-out" and "a real photograph of Dubai" were never
   going to be the same request.

   THE CHAIN, first match wins. A photograph is preferred over any
   cut-out, and the cut-outs are kept at the end rather than
   deleted so that dropping one back into assets/images/graded/
   still works exactly as before.

   COVER=<slug> jumps a candidate to the front of the queue. That
   is how the three frames are rendered through one identical
   layout - otherwise the comparison is between two layouts and
   tells you nothing about the pictures. */
const PHOTO_COVERS = ['cover-day-close', 'cover-night-close', 'cover-burj-dusk', 'cover-bay-night', 'cover-marina-dusk', 'cover-dubai-real'];
const CUTOUT_COVERS = ['cover-dubai-skyline', 'cover-dubai-tower', 'cover-dubai-hero'];

const gradedPng = (slug) =>
  Boolean(slug) && existsSync(resolve(ROOT, 'assets/images/graded/' + slug + '@300.png'));

const picked = process.env.COVER;
const photoOrder = picked ? [picked, ...PHOTO_COVERS.filter((s) => s !== picked)] : PHOTO_COVERS;

copy.art.cover = null;
copy.art.cover_ext = null;
copy.art.cover_cutout = false;

for (const slug of photoOrder) {
  if (graded(slug)) {
    copy.art.cover = slug;
    copy.art.cover_ext = 'jpg';
    break;
  }
}

if (!copy.art.cover) {
  for (const slug of CUTOUT_COVERS) {
    if (gradedPng(slug)) {
      copy.art.cover = slug;
      copy.art.cover_ext = 'png';
      copy.art.cover_cutout = true;
      break;
    }
  }
}

/* A picked slug that never graded is a typo, and a typo that
   silently renders the wrong cover is exactly the kind of thing
   that reaches a printer. Say it. */
if (picked && copy.art.cover !== picked) {
  console.log('!  COVER=' + picked + ' has no graded file - fell back to ' + (copy.art.cover ?? 'no picture'));
}

copy.art.cover_framed = Boolean(copy.art.cover) && !copy.art.cover_cutout;
copy.art.cover_plate = !copy.art.cover;
if (copy.art.cover) console.log('cover: ' + copy.art.cover + (copy.art.cover_cutout ? ' (cut-out)' : ' (photograph)'));

/* COVER LINES — the four sections named on the front.

   This is the oldest device a magazine has, and it is what stops a
   cover being a poster: it tells the reader what is inside before
   they open it. The copy is the magazine's own table of contents,
   so nothing new is written and check-copy still sees every field.

   Chosen rather than sliced off the top, because the first four
   entries are the quiet ones — an opening and a company profile.
   These four are what someone would actually buy the issue for. */
/* Three. The reference cover sets three numbered teasers with a
   rule between the numeral and the title, and a fourth row will
   not fit that treatment at this size without crowding the foot. */
copy.cover_lines = [2, 3, 6].map((i) => copy.contents[i]).filter(Boolean);

/* THE HEADLINE BREAK, set here rather than left to the measure.

   The reference cover reads BUILDING / THE FUTURE, and the first
   attempt at it was a max-width on .cover__title chosen to sit
   between the width of "BUILDING THE" and the width of "THE
   FUTURE". That is a real technique and it was the wrong one here:
   the gap between those two measurements is a few millimetres, it
   moves with the font size, the tracking and the renderer, and the
   first number picked broke the line in THREE.

   A break that the design requires should be stated, not inferred
   from arithmetic that has to be redone every time anything moves.
   So the first space becomes a <br> and the measure goes back to
   being generous.

   It is emitted through {{&...}} because it now carries markup.
   Nothing about the WORDS changes, and check-copy reads copy.json
   against the client's draft rather than the rendered page, so
   this is invisible to it either way. */
copy.cover.title_a_br = String(copy.cover.title_a).replace(/\s+/, '<br>');

/* THE STRAP, stacked. "Ten disciplines · Nine markets · One
   standard" is one string in copy.json and one line where it is
   used as a strap, but page 2 sets it as the statement of the
   inside front - and a statement is stacked. Three short lines
   land; one long line with middots in it is a caption.

   The last part takes the italic accent, the same way the cover
   headline does. Emitted through {{&...}} because it now carries
   markup; the words are untouched, and check-copy reads copy.json
   against the client's draft rather than the rendered page. */
{
  const parts = String(copy.cover.footer).split(/\s*·\s*/);
  const last = parts.length - 1;
  copy.cover.footer_stack = parts
    .map((p, i) => (i === last ? '<span class="em">' + p + '</span>' : p))
    .join('<br>');
}
/* TWO pictures on p2, so two slugs and two fallbacks - the same
   contract every other picture in this book has. If a file is
   missing the frame shows a designed plate rather than a grey
   box, and the page still prints. */
copy.art.imprint_a = graded('imprint-slabs') ? 'imprint-slabs' : null;
copy.art.imprint_b = graded('imprint-tower') ? 'imprint-tower' : null;
copy.art.imprint_a_plate = !copy.art.imprint_a;
copy.art.imprint_b_plate = !copy.art.imprint_b;
/* The office frame first, the dusk skyline behind it. Two slugs
   rather than one so the older picture stays a working fallback
   instead of becoming a dead file. */
copy.art.opening = graded('opening-office') ? 'opening-office'
  : graded('opening-burj-dusk') ? 'opening-burj-dusk'
  : null;
copy.art.company = graded('company-terrace') ? 'company-terrace' : null;
copy.art.atlas = graded('world-atlas') ? 'world-atlas' : null;
copy.art.people = graded('people-atrium') ? 'people-atrium' : null;
copy.art.value = graded('value-window') ? 'value-window' : null;
copy.art.connections = graded('connections-airport') ? 'connections-airport' : null;
copy.art.future = graded('future-marina') ? 'future-marina' : null;
copy.art.build = graded('build-table') ? 'build-table' : null;

console.log('photography: ' + have + ' of 10 venture pages have their picture' +
  (have < 10 ? ' (' + (10 - have) + ' showing icon plates -- see IMAGE-BRIEF.md)' : ''));

/* ---------- TYPOGRAPHIC QUOTES -----------------------------
   The client's draft is plain text, so it uses the typewriter
   apostrophe: Let's, there's, you're. Set at 76pt on the
   closing page that straight tick is the single most obvious
   tell that a document was typed rather than typeset.

   This changes no words. It is the same character a compositor
   has always substituted, and check-copy normalises quotes on
   both sides before comparing, so the copy guard still sees the
   client's text exactly. Applied to the rendered HTML rather
   than to copy.json, so the source of truth stays as sent. */
const curly = (t) =>
  t
    .replace(/(\w)'(\w)/g, '$1’$2')
    .replace(/(^|[\s(\[])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(\w)'(\s|$|[.,;:!?])/g, '$1’$2');

/* Only the text, never the markup or the template tags. */
const typeset = (h) =>
  h.split(/(<[^>]*>)/).map((part, i) => (i % 2 ? part : curly(part))).join('');

const html = render(src, { $root: copy, $item: copy });
const typedHtml = typeset(html);
writeFileSync(resolve(OUT, 'preview.html'), typedHtml);

const left = [...html.matchAll(/\{\{[^}]*\}\}/g)].map((m) => m[0]);
if (left.length) {
  console.log('!  unresolved template tags: ' + [...new Set(left)].join(', '));
}

console.log('wrote out/magazine/preview.html (' + (html.length / 1024).toFixed(0) + 'KB)');

/* ---------- placeholder guard -------------------------------
   The client's own draft says "Confirm real numbers with the
   client before print". A number that never got filled must not
   be able to reach a printer quietly, so every [X] is reported
   on every single build. */
/* Scan the VALUES, not the whole serialised file. Keys beginning
   with _ are notes to whoever edits copy.json, and one of them
   contains the words "[X] is an unresolved placeholder" -- so a
   naive scan of the JSON text reported the documentation of the
   guard as a violation of it. */
const holes = [];
(function walk(v, key) {
  if (typeof key === 'string' && key.startsWith('_')) return;
  if (typeof v === 'string') {
    for (const m of v.matchAll(/\[X\]\S*/g)) holes.push(m[0]);
  } else if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) walk(v[k], Array.isArray(v) ? key : k);
  }
})(copy, 'root');
if (holes.length) {
  console.log('');
  console.log('!  ' + holes.length + ' unresolved placeholder(s) in copy.json: ' + holes.join('  '));
  console.log('!  These must be filled with real figures before this goes to a printer.');
}
