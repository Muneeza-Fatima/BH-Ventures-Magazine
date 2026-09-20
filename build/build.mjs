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

const OUT = resolve(ROOT, 'out/sample');
mkdirSync(OUT, { recursive: true });

/* <!--#include path --> pulls a file in verbatim before templating.

   The icon sprite has to be inlined rather than referenced as
   <use href="icons.svg#id">: CSS cannot cross into an externally
   referenced SVG document, so `fill: none; stroke: currentColor`
   never reached the paths and every icon printed as a solid black
   blob. Inlined, the same rules apply normally. */
let src = readFileSync(resolve(ROOT, 'src/sample.html'), 'utf8');
src = src.replace(/<!--#include\s+([^\s>]+)\s*-->/g, (_, p) =>
  readFileSync(resolve(ROOT, p), 'utf8'),
);

const html = render(src, { $root: copy, $item: copy });
writeFileSync(resolve(OUT, 'preview.html'), html);

const left = [...html.matchAll(/\{\{[^}]*\}\}/g)].map((m) => m[0]);
if (left.length) {
  console.log('!  unresolved template tags: ' + [...new Set(left)].join(', '));
}

console.log('wrote out/sample/preview.html (' + (html.length / 1024).toFixed(0) + 'KB)');

/* ---------- placeholder guard -------------------------------
   The client's own draft says "Confirm real numbers with the
   client before print". A number that never got filled must not
   be able to reach a printer quietly, so every [X] is reported
   on every single build. */
const holes = [...JSON.stringify(copy).matchAll(/\[X\][^"]*/g)].map((m) => m[0]);
if (holes.length) {
  console.log('');
  console.log('!  ' + holes.length + ' unresolved placeholder(s) in copy.json: ' + holes.join('  '));
  console.log('!  These must be filled with real figures before this goes to a printer.');
}
