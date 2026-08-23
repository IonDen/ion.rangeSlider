// Dependency-free static server for the fixture pages. Serves the repo root so
// pages can load /js, /css, /node_modules/<jquery alias>/dist and /test/vendor.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.map': 'application/json' };
const port = Number(process.env.PORT || 4173);

createServer(async (req, res) => {
  const pathname = normalize(decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (pathname.includes('..')) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(join(root, pathname));
    res.writeHead(200, { 'content-type': types[extname(pathname)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end(`not found: ${pathname}`);
  }
}).listen(port, '127.0.0.1', () => console.log(`fixtures at http://127.0.0.1:${port}/test/fixtures/slider.html`));
