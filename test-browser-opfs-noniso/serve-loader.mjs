/**
 * Server for the multi-browser loader Playwright tests.
 *
 * Serves the repository root over two ports so the loader can be exercised in
 * both contexts:
 *   - 7780: cross-origin ISOLATED   (COOP + COEP headers)  → enables pthreads
 *   - 7781: NON cross-origin isolated (no COOP/COEP)        → JSPI / ASYNCIFY
 * Both proxy git smart-HTTP requests (*.git/*) to a bare repo served by the
 * shared git http backend on port 8080.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer } from '../test-browser/githttpserver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

startServer(); // git http backend on :8080

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.wasm': 'application/wasm',
};

function makeServer(isolated) {
  return http.createServer((req, res) => {
    if (isolated) {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    const urlPath = (req.url || '/').split('?')[0];

    if (urlPath === '/ping') {
      res.writeHead(200);
      res.end('pong');
      return;
    }
    if (/\.git\//.test(urlPath)) {
      const proxy = http.request(
        { hostname: 'localhost', port: 8080, path: req.url, method: req.method, headers: req.headers },
        (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); }
      );
      proxy.on('error', (e) => { res.writeHead(502); res.end('' + e); });
      req.pipe(proxy);
      return;
    }
    const filePath = urlPath === '/' ? path.join(repoRoot, 'test-browser-opfs-noniso/loader.html')
      : path.join(repoRoot, urlPath);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found: ' + urlPath); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

makeServer(true).listen(7780, () => console.log('isolated server on http://localhost:7780'));
makeServer(false).listen(7781, () => console.log('non-isolated server on http://localhost:7781'));
