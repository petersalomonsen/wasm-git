/**
 * Functional suite for the SAB-free OPFS builds, run in a NON cross-origin
 * isolated context. Exercises both the ASYNCIFY and JSPI variants through the
 * loader (forcing each variant), proving a full clone / add / commit / push /
 * readfile workflow works and that data persists in OPFS across a worker
 * "reload" — all with `self.crossOriginIsolated === false`.
 */

const VARIANTS = ['asyncify', 'jspi'];

function makeHarness() {
  let worker;

  const recv = (predicate) =>
    new Promise((resolve, reject) => {
      worker.onmessage = (msg) => {
        if (msg.data.error) { reject(new Error(msg.data.error + '\n' + (msg.data.stderr || ''))); return; }
        if (predicate(msg.data)) resolve(msg.data);
        else console.log('worker:', msg.data);
      };
    });

  const createWorker = async (variant) => {
    worker = new Worker(new URL('worker.js', import.meta.url), { type: 'module' });
    worker.postMessage({ command: 'init', variant });
    return recv((d) => d.ready === true);
  };

  const call = (command, params) => {
    const p = recv((d) => !d.ready);
    worker.postMessage(Object.assign({ command }, params));
    return p;
  };

  const terminate = () => worker && worker.terminate();

  const cleanOpfs = async (repoName) => {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(repoName, { recursive: true });
    } catch (e) { /* not present */ }
  };

  return { createWorker, call, terminate, cleanOpfs };
}

VARIANTS.forEach((variant) => {
  describe(`wasm-git OPFS (${variant}, non-isolated)`, function () {
    this.timeout(40000);

    const h = makeHarness();
    const url = `${location.origin}/testrepo.git`;

    after(() => h.terminate());

    it('reports the forced variant and a non-isolated context', async () => {
      await h.cleanOpfs('testrepo.git');
      const ready = await h.createWorker(variant);
      assert.equal(ready.variant, variant);
      assert.isFalse(ready.crossOriginIsolated, 'expected crossOriginIsolated === false');
      assert.isFalse(self.crossOriginIsolated, 'page itself must be non-isolated');
    });

    it('pings the git server', async () => {
      const res = await fetch('/testrepo.git/ping').then((r) => r.text());
      assert.equal(res, 'pong');
    });

    it('finds no existing repository in fresh OPFS', async () => {
      const r = await h.call('synclocal', { url });
      assert.isTrue(r.notfound);
    });

    it('clones the repository and pushes a commit', async () => {
      const cloned = await h.call('clone', { url });
      assert.include(cloned.dircontents, '.git');

      const pushed = await h.call('writecommitandpush', {
        filename: 'test.txt',
        contents: 'hello world!',
      });
      assert.include(pushed.dircontents, 'test.txt');
    });

    it('persists data in OPFS across a worker reload (no re-clone)', async () => {
      h.terminate();
      await h.createWorker(variant);
      const synced = await h.call('synclocal', { url });
      assert.include(synced.dircontents, '.git', 'repo should be restored from OPFS');
      assert.include(synced.dircontents, 'test.txt', 'working file should persist in OPFS');
      const read = await h.call('readfile', { filename: 'test.txt' });
      assert.equal(read.filecontents, 'hello world!');
    });

    it('normalizes "." and ".." in OPFS paths (toParts regression)', async () => {
      await h.cleanOpfs('pathnorm');
      const r = await h.call('opfspathnormalization');
      assert.equal(r.a, 'A', "'./' segment must be dropped");
      assert.equal(r.b, 'B', "'..' segment must pop the previous one");
      await h.cleanOpfs('pathnorm');
    });

    it('removes the local clone', async () => {
      const del = await h.call('deletelocal');
      assert.equal(del.deleted, 'testrepo.git');
    });

    it('re-clones from the server with the pushed contents', async () => {
      h.terminate();
      await h.cleanOpfs('testrepo.git');
      await h.createWorker(variant);
      const cloned = await h.call('clone', { url });
      assert.include(cloned.dircontents, '.git');
      assert.include(cloned.dircontents, 'test.txt');
      const read = await h.call('readfile', { filename: 'test.txt' });
      assert.equal(read.filecontents, 'hello world!');
    });
  });
});
