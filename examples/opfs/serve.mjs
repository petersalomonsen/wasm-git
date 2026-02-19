/**
 * Static file server for the wasm-git OPFS example.
 *
 * - Serves files from the repository root on port 7778 with the
 *   Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers
 *   required for SharedArrayBuffer (pthreads).
 * - Starts a git HTTP backend on port 8080 and proxies *.git/* requests to it.
 *
 * Usage: node examples/opfs/serve.mjs
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cgi from 'cgi';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const PORT = 7778;
const GIT_PORT = 8080;

// ---------------------------------------------------------------------------
// Git HTTP server (port GIT_PORT)
// ---------------------------------------------------------------------------

const testrepodir = `${tmpdir()}/testrepo.git`;
fs.rmSync(testrepodir, { recursive: true, force: true });
execSync(`git init --initial-branch=master --bare ${testrepodir}`);
console.log(`Git repo initialized at ${testrepodir}`);

const gitcgi = cgi('git', {
    args: ['http-backend'],
    stderr: process.stderr,
    env: {
        GIT_PROJECT_ROOT: tmpdir(),
        GIT_HTTP_EXPORT_ALL: '1',
        REMOTE_USER: 'demo@example.com',
    },
});

http.createServer((req, res) => {
    const url = req.url || '/';
    if (url.includes('git-upload-pack') || url.includes('git-receive-pack') || url.includes('info/refs')) {
        gitcgi(req, res);
    } else {
        res.writeHead(404);
        res.end('not found');
    }
}).listen(GIT_PORT, () => console.log(`Git server listening on port ${GIT_PORT}`));

// ---------------------------------------------------------------------------
// Static file server with COOP/COEP headers (port PORT)
// ---------------------------------------------------------------------------

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript',
    '.mjs':  'application/javascript',
    '.wasm': 'application/wasm',
    '.css':  'text/css',
    '.txt':  'text/plain',
};

function proxyToGit(req, res) {
    const proxyReq = http.request(
        {
            hostname: 'localhost',
            port: GIT_PORT,
            path: req.url,
            method: req.method,
            headers: req.headers,
        },
        (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        }
    );
    proxyReq.on('error', (err) => {
        res.writeHead(502);
        res.end('Proxy error: ' + err.message);
    });
    req.pipe(proxyReq);
}

http.createServer((req, res) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');

    const urlPath = (req.url || '/').split('?')[0];

    // Health check for Playwright webServer startup detection
    if (urlPath === '/ping') {
        res.writeHead(200);
        res.end('pong');
        return;
    }

    // Proxy git smart-HTTP requests to the git server
    if (/\.git\//.test(urlPath)) {
        proxyToGit(req, res);
        return;
    }

    // Resolve file path from repo root; default to example index
    const filePath =
        urlPath === '/' || urlPath === '/examples/opfs' || urlPath === '/examples/opfs/'
            ? path.join(repoRoot, 'examples/opfs/index.html')
            : path.join(repoRoot, urlPath);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end(`Not found: ${urlPath}`);
            return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
}).listen(PORT, () => console.log(`OPFS example server running at http://localhost:${PORT}/examples/opfs/`));
