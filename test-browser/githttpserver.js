import http from 'http';
import fs from 'fs';
import cgi from 'cgi';
import { tmpdir } from 'os';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';


/**
 * This example will create a git http server to repositories on your local disk.
 * Set the GIT_PROJECT_ROOT environment variable to point to location of your git repositories.
 */

export function startServer() {
    const testrepodir = `${tmpdir()}/testrepo.git`;
    fs.rmSync(testrepodir, {recursive: true, force: true});
    execSync(`git init --initial-branch=master --bare ${tmpdir()}/testrepo.git`);
    fs.rmSync(`${tmpdir()}/testremote.git`, {recursive: true, force: true});
    execSync(`git init --initial-branch=master --bare ${tmpdir()}/testremote.git`);

    if (process.env.GIT_SERVER === 'wasm') {
        return startWasmServer();
    }

    const script = 'git';

    const gitcgi = cgi(script, {args: ['http-backend'],
        stderr: process.stderr,
        env: {
            'GIT_PROJECT_ROOT': tmpdir(),
            'GIT_HTTP_EXPORT_ALL': '1',
            'REMOTE_USER': 'test@example.com' // Push requires authenticated users by default
        }
    });

    return http.createServer( (request, response) => {
        let path = request.url.substring(1);

        console.log('git http server request', request.url);
        
        if (path.indexOf('ping') > -1) {
            response.statusCode = 200;
            response.end('pong');
        } else if( path.indexOf('git-upload') > -1 ||
            path.indexOf('git-receive') > -1) {
            gitcgi(request, response);
        } else {
            response.statusCode = 404;
            response.end('not found');
        }
    }).listen(8080);
}

/**
 * GIT_SERVER=wasm: serve the same repositories with the WASI git server example
 * (wasibuild/build.sh server) in `wasmtime serve` instead of git http-backend.
 * Set GIT_SERVER_WASM and WASMTIME to use another component or runtime binary.
 */
function startWasmServer() {
    const component = process.env.GIT_SERVER_WASM ??
        fileURLToPath(new URL('../wasibuild/server-build/gitserver.wasm', import.meta.url));
    const wasmtime = spawn(process.env.WASMTIME ?? 'wasmtime', [
        'serve', '-S', 'cli', '--dir', `${tmpdir()}::/repos`, '--addr', '[::]:8080', component
    ], { stdio: 'inherit' });
    const close = () => wasmtime.kill();
    process.on('exit', close);

    // block until it accepts requests, like the synchronous listen() above
    for (let i = 0; i < 100; i++) {
        try {
            execSync('curl -sf http://localhost:8080/ping', { stdio: 'ignore' });
            break;
        } catch {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
        }
    }
    return { close };
}

export default {
    startServer: startServer
}
