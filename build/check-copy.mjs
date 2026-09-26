/* ============================================================
   check-copy.mjs — does the magazine still say what the client
   approved?

   This exists because it already went wrong once. A clause went
   missing from §02 during layout —

     "…from automobile export to AI consultancy — is engineered to
      the same exacting standard, and answers to the same address
      in Dubai."

   — and nothing caught it. The page looked fine. It read fine. It
   was simply not what the client wrote, and it only surfaced when
   they re-sent the draft and asked for it to be checked.

   Copy that silently drifts from what was approved is a worse
   failure than a build that refuses to run, so this one fails.

   content/client-draft.txt holds the approved text verbatim. Every
   sentence in copy.json that carries client wording has to appear
   in it. Comparison ignores whitespace and normalises the quote
   characters and dashes that move around between editors — those
   are typesetting, not wording.

   Usage: node build/check-copy.mjs
   ============================================================ */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const draft = readFileSync(resolve(ROOT, 'content/client-draft.txt'), 'utf8');
const copy = JSON.parse(readFileSync(resolve(ROOT, 'content/copy.json'), 'utf8'));

/* Normalise only what is typography, never what is wording:
   curly quotes, the various dashes, and runs of whitespace. */
const norm = (s) =>
  String(s)
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const haystack = norm(draft);

/* Every field below carries the client's own words. Fields that are
   ours — labels, kickers, the presentation boards — are not checked,
   because we wrote them. */
const checks = [];
const add = (path, value) => {
  if (typeof value === 'string' && value.trim()) checks.push([path, value]);
};

add('s01.body', copy.s01.body);
add('s01.statement', copy.s01.statement);
copy.s02.body.forEach((p, i) => add('s02.body[' + i + ']', p));
add('s03.lede', copy.s03.lede);
add('s03.body', copy.s03.body);
add('s04.closing', copy.s04.closing);
copy.s04.ventures.forEach((v) => {
  add('s04 name ' + v.n, v.name);
  add('s04 desc ' + v.n, v.desc);
});
add('s05.body', copy.s05.body);
add('s06.lede', copy.s06.lede);
copy.s06.items.forEach((it) => add('s06 ' + it.n, it.desc));
add('s07.body', copy.s07.body);
add('s07.pullquote', copy.s07.pullquote);
add('s08.body', copy.s08.body);
copy.s09.body.forEach((p, i) => add('s09.body[' + i + ']', p));
add('s10.body', copy.s10.body);

/* The display quotes and closing lines. These are the client's
   sentences too -- they were simply split across two fields so
   the second half could be set in italic. Rejoining them before
   the comparison is the only honest way to check them, and
   leaving them unchecked is how the missing clause in s02 got
   into the layout in the first place. */
const joined = (path, ...parts) => add(path, parts.filter(Boolean).join(' '));

joined('s02.pullquote', copy.s02.pullquote_a, copy.s02.pullquote_b);
joined('s05.pullquote', copy.s05.pullquote_a, copy.s05.pullquote_b);
joined('s09.pullquote', copy.s09.pullquote_a, copy.s09.pullquote_b);
joined('s06.closing', copy.s06.closing_a, copy.s06.closing_em + copy.s06.closing_b);
joined('s08.closing', copy.s08.closing_a, copy.s08.closing_em);

const missing = checks.filter(([, v]) => !haystack.includes(norm(v)));

const line = '-'.repeat(60);
console.log('\n' + line + '\n  check-copy  ·  ' + checks.length + ' fields against the client draft\n' + line);

if (!missing.length) {
  console.log('  OK  every field matches the approved text\n');
  process.exit(0);
}

for (const [path, value] of missing) {
  console.log('  DRIFT  ' + path);
  console.log('         in copy.json: "' + String(value).slice(0, 96) + (value.length > 96 ? '…' : '') + '"');

  /* Point at where it diverges, so the fix is obvious rather than a
     hunt through two paragraphs. */
  const words = norm(value).split(' ');
  let longest = '';
  for (let start = 0; start < words.length; start++) {
    for (let end = words.length; end > start; end--) {
      const run = words.slice(start, end).join(' ');
      if (run.length > longest.length && haystack.includes(run)) longest = run;
    }
  }
  if (longest && longest.length < norm(value).length) {
    console.log('         diverges after: "…' + longest.slice(-70) + '"');
  }
  console.log('');
}

console.log(line);
console.log('  FAILED — ' + missing.length + ' field(s) do not match content/client-draft.txt\n');
process.exit(1);
