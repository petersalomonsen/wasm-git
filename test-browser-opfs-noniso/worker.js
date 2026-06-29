/**
 * Web Worker for the SAB-free OPFS builds (ASYNCIFY / JSPI), driven through the
 * runtime loader's uniform OpfsGit API. Runs in a non-cross-origin-isolated
 * context (no SharedArrayBuffer). OPFS sync access handles require a Worker, so
 * all git work happens here.
 */
import { loadOpfsGit } from './lg2_opfs_auto.js';

let git;
let currentRepo;
let stdout = [];
let stderr = [];

onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.command === 'init') {
      stdout = [];
      stderr = [];
      globalThis.wasmGitModuleOverrides = {
        print: (t) => { console.log(t); stdout.push(t); },
        printErr: (t) => { console.error(t); stderr.push(t); },
      };
      git = await loadOpfsGit({
        variant: m.variant, // undefined → auto-detect
        user: 'Test User',
        email: 'test@example.com',
      });
      postMessage({
        ready: true,
        variant: git.variant,
        crossOriginIsolated: git.crossOriginIsolated,
      });
      return;
    }

    if (m.command === 'synclocal') {
      currentRepo = m.url.substring(m.url.lastIndexOf('/') + 1);
      const found = await git.syncRepo(currentRepo);
      postMessage(found ? { dircontents: git.readdir(currentRepo) } : { notfound: true });
    } else if (m.command === 'clone') {
      currentRepo = m.url.substring(m.url.lastIndexOf('/') + 1);
      const dircontents = await git.clone(m.url, currentRepo);
      postMessage({ dircontents });
    } else if (m.command === 'writecommitandpush') {
      await git.writeFile(currentRepo, m.filename, m.contents);
      const dircontents = await git.addCommitPush(currentRepo, m.filename, `add ${m.filename}`);
      postMessage({ dircontents });
    } else if (m.command === 'opfspathnormalization') {
      // Regression: OPFS paths with '.'/'..' segments (e.g. from libgit2
      // resolving `init .`) must normalize, not be passed to OPFS as '.'/''
      // directory names. Exercises OPFS.toParts via opfsWriteFile/opfsReadFile.
      await git.module.opfsWriteFile('/opfs/pathnorm/./a.txt', 'A');
      await git.module.opfsWriteFile('/opfs/pathnorm/sub/../b.txt', 'B');
      postMessage({
        a: await git.module.opfsReadFile('/opfs/pathnorm/a.txt', 'utf8'),
        b: await git.module.opfsReadFile('/opfs/pathnorm/b.txt', 'utf8'),
      });
    } else if (m.command === 'readfile') {
      postMessage({ filename: m.filename, filecontents: git.readFile(currentRepo, m.filename) });
    } else if (m.command === 'deletelocal') {
      await git.removeRepo(currentRepo);
      const deleted = currentRepo;
      currentRepo = undefined;
      postMessage({ deleted });
    } else {
      postMessage({ error: 'unknown command: ' + m.command });
    }
  } catch (err) {
    postMessage({ error: String((err && err.stack) || err), stderr: stderr.join('\n') });
  }
};
