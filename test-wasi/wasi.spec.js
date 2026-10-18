import assert from 'assert';
import fs from 'fs';
import { tmpdir } from 'os';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { startServer } from '../test-browser/githttpserver.js';

/**
 * Runs the WASI component build (wasibuild/build.sh) of lg2 in Wasmtime.
 * Set LG2_WASI to use another build, and WASMTIME to use another runtime binary.
 */
const lg2 = process.env.LG2_WASI ?? fileURLToPath(new URL('../wasibuild/examples/lg2.wasm', import.meta.url));
const wasmtime = process.env.WASMTIME ?? 'wasmtime';

const workdir = `${tmpdir()}/wasm-git-wasi-test`;

/**
 * Run lg2 with hostdir mounted as the guest root, which is also the working directory.
 * Async, so that the git http server in this same process can serve it.
 */
async function lg(hostdir, ...args) {
    const { stdout } = await promisify(execFile)(wasmtime, [
        'run', '-S', 'http', '-S', 'inherit-network',
        '--dir', `${hostdir}::/`, '--env', 'HOME=/',
        lg2, ...args
    ], { encoding: 'utf8' });
    return stdout;
}

function writeGitConfig(dir) {
    fs.writeFileSync(`${dir}/.gitconfig`, '[user]\n\tname = The Tester\n\temail = test@testing.com\n');
}

describe('WASI component (wasmtime)', function () {
    this.timeout(60000);

    let server;

    before(() => {
        fs.rmSync(workdir, { recursive: true, force: true });
        fs.mkdirSync(workdir, { recursive: true });
        server = startServer();
    });

    after(() => server.close());

    it('should init, add, commit and log without any network', async () => {
        const repo = `${workdir}/local`;
        fs.mkdirSync(repo);
        writeGitConfig(repo);

        await lg(repo, 'init', '.');
        fs.writeFileSync(`${repo}/hello.txt`, 'hello from wasi');
        await lg(repo, 'add', 'hello.txt');
        await lg(repo, 'commit', '-m', 'first commit');

        assert.match(await lg(repo, 'log'), /first commit/);
        // the native git client reads what the component wrote
        assert.equal(execSync('git log --format=%s', { cwd: repo, encoding: 'utf8' }).trim(), 'first commit');
        assert.equal(execSync('git fsck', { cwd: repo, encoding: 'utf8' }).trim(), '');
    });

    it('should clone and push over wasi:http', async () => {
        // seed the served bare repository with native git
        const seed = `${workdir}/seed`;
        execSync(`git init -q -b master ${seed}`);
        fs.writeFileSync(`${seed}/seed.txt`, 'seeded');
        execSync('git add seed.txt && git -c user.name=Seed -c user.email=seed@example.com commit -q -m seed', { cwd: seed });
        execSync(`git push -q ${tmpdir()}/testrepo.git master`, { cwd: seed });

        await lg(workdir, 'clone', 'http://localhost:8080/testrepo.git', 'clone');
        const clone = `${workdir}/clone`;
        assert.equal(fs.readFileSync(`${clone}/seed.txt`, 'utf8'), 'seeded');

        writeGitConfig(clone);
        fs.writeFileSync(`${clone}/pushed.txt`, 'pushed from wasi');
        await lg(clone, 'add', 'pushed.txt');
        await lg(clone, 'commit', '-m', 'pushed from wasmtime');
        await lg(clone, 'push');

        const log = execSync('git log --format=%s master', { cwd: `${tmpdir()}/testrepo.git`, encoding: 'utf8' });
        assert.equal(log.trim(), 'pushed from wasmtime\nseed');
    });
});
