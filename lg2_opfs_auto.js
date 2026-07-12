/**
 * lg2_opfs_auto.js — runtime loader that picks the most optimal OPFS-backed
 * wasm-git build the current browser supports, and exposes a single, uniform
 * git API on top of all three OPFS variants.
 *
 * Selection order (best first):
 *   1. pthreads / WasmFS  (lg2_opfs.js)       — fastest, needs cross-origin
 *      isolation (SharedArrayBuffer + COOP/COEP).
 *   2. JSPI                (lg2_opfs_jspi.js)  — WebAssembly stack switching;
 *      no SharedArrayBuffer required.
 *   3. ASYNCIFY            (lg2_opfs_async.js) — universal fallback; works
 *      everywhere wasm + OPFS do, no SharedArrayBuffer required.
 *
 * If OPFS itself is unavailable (no `navigator.storage.getDirectory`, insecure
 * context) `selectOpfsVariant()` returns `null`; callers should fall back to
 * the non-OPFS IDBFS build (`lg2.js`).
 *
 * The detection helpers below are pure and take an `env` object (defaulting to
 * `globalThis`) so they can be unit-tested / forced in tests.
 *
 * Usage (inside a Web Worker — OPFS sync access handles require a Worker):
 *
 *   import { loadOpfsGit } from './lg2_opfs_auto.js';
 *   const git = await loadOpfsGit({ user: 'Me', email: 'me@example.com' });
 *   console.log(git.variant);            // 'pthreads' | 'jspi' | 'asyncify'
 *   await git.clone(url, 'repo.git');
 *   await git.writeFile('repo.git', 'a.txt', 'hello');
 *   await git.addCommitPush('repo.git', 'a.txt', 'add a.txt');
 *   git.readFile('repo.git', 'a.txt');   // 'hello'
 */

export const VARIANT_FILES = {
  pthreads: 'lg2_opfs.js',
  jspi: 'lg2_opfs_jspi.js',
  asyncify: 'lg2_opfs_async.js',
};

/**
 * Feature-detect the relevant capabilities of an environment.
 * @param {object} [env=globalThis]
 * @returns {{opfsAvailable:boolean, crossOriginIsolated:boolean, jspiAvailable:boolean}}
 */
export function detectOpfsEnvironment(env = globalThis) {
  const nav = env.navigator;
  const opfsAvailable = !!(
    nav &&
    nav.storage &&
    typeof nav.storage.getDirectory === 'function'
  );
  const crossOriginIsolated =
    env.crossOriginIsolated === true && typeof env.SharedArrayBuffer !== 'undefined';
  const wasm = env.WebAssembly;
  // JSPI shipped as WebAssembly.Suspending / WebAssembly.promising. Older
  // experimental builds exposed WebAssembly.Function with a suspending option;
  // we only rely on the shipped API here.
  const jspiAvailable = !!(
    wasm &&
    (typeof wasm.Suspending === 'function' || typeof wasm.promising === 'function')
  );
  return { opfsAvailable, crossOriginIsolated, jspiAvailable };
}

/**
 * Choose the best OPFS build for an environment.
 * @param {object} [env=globalThis]
 * @returns {('pthreads'|'jspi'|'asyncify'|null)} null means OPFS is unavailable.
 */
export function selectOpfsVariant(env = globalThis) {
  const { opfsAvailable, crossOriginIsolated, jspiAvailable } = detectOpfsEnvironment(env);
  if (!opfsAvailable) return null;
  if (crossOriginIsolated) return 'pthreads';
  if (jspiAvailable) return 'jspi';
  return 'asyncify';
}

/**
 * Load and initialise the selected OPFS build.
 *
 * @param {object} [options]
 * @param {object} [options.env=globalThis]            environment to detect against
 * @param {string} [options.variant]                   force a variant (skip detection)
 * @param {string|URL} [options.baseUrl=import.meta.url] base for resolving the variant file
 * @param {object} [options.variantFiles=VARIANT_FILES] override variant→filename map
 * @param {object} [options.moduleOverrides]           print/printErr overrides for the module
 * @param {string} [options.user]                      git user.name to write to ~/.gitconfig
 * @param {string} [options.email]                     git user.email to write to ~/.gitconfig
 * @returns {Promise<OpfsGit>}
 */
export async function loadOpfsGit(options = {}) {
  const env = options.env || globalThis;
  const variant = options.variant || selectOpfsVariant(env);
  if (!variant) {
    throw new Error(
      'OPFS is not available in this context — fall back to the IDBFS build (lg2.js).'
    );
  }
  const files = options.variantFiles || VARIANT_FILES;
  const file = files[variant];
  if (!file) throw new Error(`Unknown OPFS variant: ${variant}`);

  if (options.moduleOverrides) {
    globalThis.wasmGitModuleOverrides = options.moduleOverrides;
  }

  const baseUrl = options.baseUrl || import.meta.url;
  const mod = await import(new URL(file, baseUrl));
  const module = await mod.default(options.moduleArg || {});

  const git = new OpfsGit(module, variant, env);
  await git.init({ user: options.user, email: options.email });
  return git;
}

/**
 * Uniform git facade over the three OPFS variants. Repos live under `/opfs`
 * (the OPFS root). All methods accept a bare repo directory name (e.g.
 * `repo.git`) which is resolved under `/opfs`.
 */
export class OpfsGit {
  constructor(module, variant, env = globalThis) {
    this.module = module;
    this.FS = module.FS;
    this.variant = variant;
    this.crossOriginIsolated = env.crossOriginIsolated === true;
    this.opfsRoot = '/opfs';
  }

  repoDir(repoName) {
    return `${this.opfsRoot}/${repoName}`;
  }

  async init({ user = 'wasm-git', email = 'wasm-git@example.com' } = {}) {
    const FS = this.FS;
    try { FS.mkdir('/home'); } catch (e) {}
    try { FS.mkdir('/home/web_user'); } catch (e) {}
    FS.writeFile('/home/web_user/.gitconfig', `[user]\nname = ${user}\nemail = ${email}`);

    if (this.variant === 'pthreads') {
      // WasmFS: explicitly mount an OPFS backend at /opfs.
      const backend = this.module._lg2_create_opfs_backend();
      if (!backend) throw new Error('Failed to create OPFS backend');
      const rc = this.module.ccall(
        'lg2_create_directory', 'number',
        ['string', 'number', 'number'],
        [this.opfsRoot, 0o777, backend]
      );
      if (rc !== 0) throw new Error('Failed to create OPFS directory, error: ' + rc);
    }
    // For async/jspi the /opfs MEMFS mount is created by the library at preRun.
    FS.chdir(this.opfsRoot);
    return this;
  }

  // ---- WasmFS getcwd() workaround (pthreads only) -------------------------
  // WasmFS getcwd() drops the mount-point name for OPFS-backed dirs, returning
  // '//repo' instead of '/opfs/repo', which breaks libgit2 repo discovery. A
  // root symlink makes the broken path still resolve correctly.
  _createMountSymlink(repoName) {
    try { this.FS.unlink('/' + repoName); } catch (e) {}
    this.FS.symlink(this.repoDir(repoName), '/' + repoName);
  }
  _removeMountSymlink(repoName) {
    try { this.FS.unlink('/' + repoName); } catch (e) {}
  }

  _rmdirRecursive(path) {
    const FS = this.FS;
    for (const entry of FS.readdir(path).filter((e) => e !== '.' && e !== '..')) {
      const full = path + '/' + entry;
      try { FS.readdir(full); this._rmdirRecursive(full); }
      catch (e) { FS.unlink(full); }
    }
    FS.rmdir(path);
  }

  /** callMain that works for both sync (pthreads) and async (asyncify/jspi). */
  async run(args) {
    return await this.module.callMain(args);
  }

  /**
   * Recreate git's REQUIRED empty directories. Anything that copies a repo
   * file-by-file (IDBFS→OPFS migrations, zip round-trips, object-store synced
   * copies) silently loses empty directories — and libgit2 cannot create
   * `.git/objects/pack` itself: a later fetch downloads the packfile but never
   * indexes it, failing with "target OID for the reference doesn't exist on
   * the repository" and no hint of the real cause (diagnosed from a real user
   * repository that had only ever written loose objects).
   */
  _ensureGitSkeleton(dir) {
    const FS = this.FS;
    try { FS.readdir(`${dir}/.git/objects`); } catch (e) { return; }
    for (const sub of ['objects/pack', 'objects/info', 'refs', 'refs/heads', 'refs/tags']) {
      try { FS.mkdir(`${dir}/.git/${sub}`); } catch (e) { /* exists */ }
    }
  }

  /**
   * Make an already-persisted repo available locally.
   * @returns {Promise<boolean>} true if the repo exists in OPFS.
   */
  async syncRepo(repoName) {
    const FS = this.FS;
    const dir = this.repoDir(repoName);
    if (this.variant === 'pthreads') {
      try {
        const contents = FS.readdir(dir);
        if (contents.find((f) => f === '.git')) {
          this._createMountSymlink(repoName);
          this._ensureGitSkeleton(dir);
          FS.chdir(dir);
          return true;
        }
      } catch (e) { /* not present */ }
      return false;
    }
    // async / jspi: load the OPFS sub-tree into the MEMFS cache.
    const loaded = await this.module.opfsLoadTree(dir);
    if (!loaded) return false;
    try {
      if (FS.readdir(dir).find((f) => f === '.git')) {
        this._ensureGitSkeleton(dir);
        FS.chdir(dir);
        return true;
      }
    } catch (e) {}
    return false;
  }

  /** Clone a repository into `/opfs/<repoName>`, replacing any existing copy. */
  async clone(url, repoName) {
    const FS = this.FS;
    const dir = this.repoDir(repoName);
    await this.removeRepo(repoName);
    await this.run(['clone', url, dir]);
    if (this.variant === 'pthreads') this._createMountSymlink(repoName);
    FS.chdir(dir);
    return FS.readdir('.');
  }

  /** Write a working-tree file, persisting it to OPFS. */
  async writeFile(repoName, filename, contents) {
    const path = `${this.repoDir(repoName)}/${filename}`;
    if (this.variant === 'pthreads') {
      this.FS.writeFile(path, contents);
    } else {
      await this.module.opfsWriteFile(path, contents);
    }
  }

  /** Read a working-tree file from the local cache. */
  readFile(repoName, filename, encoding = 'utf8') {
    return this.FS.readFile(`${this.repoDir(repoName)}/${filename}`, { encoding });
  }

  readdir(repoName) {
    return this.FS.readdir(this.repoDir(repoName));
  }

  /** Stage, commit and push a file. */
  async addCommitPush(repoName, filename, message = `update ${filename}`) {
    const FS = this.FS;
    const dir = this.repoDir(repoName);
    FS.chdir(dir);
    await this.run(['add', '--verbose', filename]);
    FS.chdir(dir);
    await this.run(['commit', '-m', message]);
    FS.chdir(dir);
    await this.run(['push']);
    FS.chdir(dir);
    return FS.readdir('.');
  }

  /** Delete a repo from both the local cache and OPFS. */
  async removeRepo(repoName) {
    const dir = this.repoDir(repoName);
    if (this.variant === 'pthreads') {
      try { this._rmdirRecursive(dir); } catch (e) {}
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(repoName, { recursive: true });
      } catch (e) {}
      this._removeMountSymlink(repoName);
    } else {
      await this.module.opfsRemoveTree(dir);
    }
  }
}

export default loadOpfsGit;
