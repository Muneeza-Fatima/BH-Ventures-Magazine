/* ============================================================
   dev-server.mjs — live preview while editing.

   Serves the project, watches the files that matter, rebuilds the
   HTML when one changes, and tells the open browser to reload. No
   dependencies: node's own http, fs.watch and an EventSource.

   The PDF is NOT rebuilt on every keystroke — it takes a few
   seconds and the browser preview is pixel-identical anyway,
   because both come from the same HTML and the same print.css.
   Run `npm run pdf` when you want the PDF.

   Usage: npm run dev   ->  http://localhost:5173
   ============================================================ */

import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5173;
const PAGE = '/out/sample/preview.html';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
};

/* Injected into the served HTML only — never into the file on
   disk, so it can never reach the PDF. */
const RELOAD = `
<script>
(function () {
  var es = new EventSource('/__reload');
  es.onmessage = function () { location.reload(); };
  es.onerror = function () { /* server restarting; EventSource retries by itself */ };
})();
</script>
`;

const clients = new Set();

function rebuild(reason) {
  const started = Date.now();
  try {
    execFileSync(process.execPath, [resolve(ROOT, 'build/build.mjs')], { cwd: ROOT, stdio: 'pipe' });
    console.log('  rebuilt (' + reason + ') in ' + (Date.now() - started) + 'ms');
  } catch (err) {
    console.log('  BUILD FAILED (' + reason + ')');
    console.log(String(err.stdout ?? '') + String(err.stderr ?? ''));
    return;
  }
  for (const res of clients) res.write('data: reload\n\n');
}

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);

  if (url === '/__reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 500\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  const path = url === '/' ? PAGE : url;
  const file = join(ROOT, path);

  /* Keep the server inside the project directory. */
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  try {
    const info = await stat(file);
    if (info.isDirectory()) throw new Error('directory');
    let body = await readFile(file);
    const ext = extname(file).toLowerCase();
    if (ext === '.html') body = Buffer.from(String(body).replace('</body>', RELOAD + '</body>'));
    res.writeHead(200, { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found: ' + path);
  }
});

/* fs.watch fires several times for one save on Windows, so debounce. */
let timer = null;
const queue = (what) => {
  clearTimeout(timer);
  timer = setTimeout(() => rebuild(what), 120);
};

for (const dir of ['content', 'src', 'brand', 'assets/graphics']) {
  watch(resolve(ROOT, dir), { recursive: true }, (_e, name) => {
    if (name && !name.endsWith('~')) queue(dir + '/' + name);
  });
}

rebuild('startup');

server.listen(PORT, () => {
  console.log('');
  console.log('  BH Ventures magazine - live preview');
  console.log('  http://localhost:' + PORT);
  console.log('');
  console.log('  watching  content/  src/  brand/  assets/graphics/');
  console.log('  edit content/copy.json and the page reloads by itself');
  console.log('  ctrl-c to stop');
  console.log('');
});
