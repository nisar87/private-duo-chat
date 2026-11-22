// Tiny static server that applies the same security headers as firebase.json,
// so the smoke test also proves the app works under the real Content-Security-Policy.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = new URL('../../dist-e2e/', import.meta.url).pathname;
const cfg = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8'));
const all = cfg.hosting.headers.find((h) => h.source === '**').headers;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain' };

export function serve(port = 4173) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x').pathname;
    let file = join(root, normalize(url));
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
    for (const h of all) res.setHeader(h.key, h.value);
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
