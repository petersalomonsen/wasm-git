Wasm-git
========
([Wasm should be pronounced like `awesome` starting with a `W`](https://youtu.be/C8j_ieOm4vE?t=1644) — as stated in the [WebAssembly Music](https://github.com/petersalomonsen/javascriptmusic) talk at WebAssembly Summit 2020).

![](https://github.com/petersalomonsen/wasm-git/actions/workflows/main.yml/badge.svg)

Git for Node.js and the browser, using [libgit2](https://libgit2.org/) compiled to WebAssembly with [Emscripten](https://emscripten.org).

Imagine that every app you use kept a complete journal of your data: every change recorded, a backup on your own computer that is truly yours, and synchronization between your devices whenever you want it. Software developers have had exactly this for decades — the tool is called Git. Wasm-git brings that same engine to web applications: store user data locally in the browser with full change history, and push/pull to a remote when — and only when — the user chooses. The application doesn't need to expose any Git terminology: a single "synchronize data" button can do all of it behind the scenes.

# Quick start

```bash
npm install wasm-git
```

The package ships prebuilt WebAssembly binaries in several variants (see [Choosing a variant](#choosing-a-variant) below). The easiest one to start with is the **async** variant, which runs on the browser main thread or in Node.js with plain `async`/`await`:

```javascript
import initGit from 'wasm-git/lg2_async.js';

const lg = await initGit();
const FS = lg.FS;

// Git needs to know who you are before committing
FS.writeFile('/home/web_user/.gitconfig',
  '[user]\nname = Your Name\nemail = you@example.com');

// Create a repository, add a file, and commit
FS.mkdir('/myrepo');
FS.chdir('/myrepo');
await lg.callMain(['init', '.']);
FS.writeFile('data.json', JSON.stringify({ hello: 'world' }));
await lg.callMain(['add', 'data.json']);
await lg.callMain(['commit', '-m', 'first commit']);
```

Cloning and pushing over HTTP works the same way:

```javascript
await lg.callMain(['clone', 'https://your-git-server.example.com/repo.git', 'repo']);
FS.chdir('repo');
// ...edit files, add, commit...
await lg.callMain(['push']);
```

When cloning from the browser, the git server must allow cross-origin requests (CORS) — or be served from the same origin. [githttpserver](https://github.com/petersalomonsen/githttpserver) is a ready-made reference server, and its live instance at https://wasm-git.petersalomonsen.com/ is an open playground where you can try cloning, editing, committing and pushing directly in the browser (please don't abuse it — it's there for you to test).

The files can also be loaded from public CDNs such as unpkg or jsDelivr (e.g. `https://unpkg.com/wasm-git/lg2_async.js`).

# Choosing a variant

| Variant | File | Where it runs | Persistence | Notes |
|---------|------|---------------|-------------|-------|
| **Sync** | `lg2.js` | Browser: **Web Worker only**. Node.js: main thread or [worker_threads](https://nodejs.org/api/worker_threads.html) | MEMFS / [IDBFS](https://emscripten.org/docs/api_reference/Filesystem-API.html#filesystem-api-idbfs) / NODEFS | Smallest binary; synchronous `callMain`. Needs a worker in the browser because of synchronous HTTP and long-running operations. |
| **Async** | `lg2_async.js` | Browser main thread or worker; Node.js | MEMFS / IDBFS / NODEFS | [Asyncify](https://emscripten.org/docs/porting/asyncify.html) build: `await lg.callMain(...)`. Larger binary, simplest client code. |
| **OPFS (pthreads)** | `lg2_opfs.js` | Web Worker, requires [cross-origin isolation](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated) | [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) | Fastest OPFS variant; needs COOP/COEP headers for SharedArrayBuffer. |
| **OPFS (JSPI)** | `lg2_opfs_jspi.js` | Web Worker, no isolation needed | OPFS | SAB-free, smallest OPFS binary; needs a [JSPI](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Suspending)-capable browser. |
| **OPFS (ASYNCIFY)** | `lg2_opfs_async.js` | Web Worker, no isolation needed | OPFS | SAB-free universal fallback; largest binary. |
| **OPFS auto-loader** | `lg2_opfs_auto.js` | Web Worker | OPFS | Picks the best supported OPFS build at runtime and exposes a uniform API — see [OPFS variants and the runtime loader](#opfs-variants-and-the-runtime-loader). |

For browser persistence with the sync/async variants, mount IDBFS and call `FS.syncfs` — or use the OPFS variants, which persist through the filesystem itself with better performance and quota management.

Complete working examples for every variant are in the test folders:

- [test](./test/) for Node.js
- [test-browser](./test-browser/) for the sync version in a web worker
- [test-browser-async](./test-browser-async/) for the async version
- [test-browser-opfs](./test-browser-opfs/) for the OPFS (pthreads/WASMFS) version
- [test-browser-opfs-noniso](./test-browser-opfs-noniso/) for the SAB-free OPFS variants (ASYNCIFY + JSPI) and the runtime loader

# Built with wasm-git

- **[Ariz-Portfolio](https://github.com/arizas/Ariz-Portfolio/)** — tracks crypto asset balances, profits and losses on the NEAR protocol blockchain. Uses wasm-git to store portfolio data with full change history on the user's own machine, and lets the user download a complete copy — history included — to their computer. Its optional cloud sync is end-to-end encrypted with [encrypted-git-storage](https://github.com/petersalomonsen/encrypted-git-storage): repositories are encrypted before upload with keys only the user holds.
- **[Y42](https://www.y42.com/)** — a data pipeline platform (DataOps) where every integration, model and dashboard is versioned in git. In the Data Council talk [Using GIT as a NoSQL Database](https://www.youtube.com/watch?v=mtc-Hwv1aik&t=618s), Y42's founder Hung Dang explains that "under the hood we developed our own git client for the browser using wasm-git, which is a WebAssembly compiled version of libgit2" — and [recommends checking out wasm-git](https://www.youtube.com/watch?v=mtc-Hwv1aik&t=2007s) at the end of the talk.
- **[WebAssembly Music](https://github.com/petersalomonsen/javascriptmusic)** — a music-making environment in the browser and wasm-git's original driving use case: compositions and instruments are stored and versioned locally, and synchronized with a remote when the user chooses. See it in action in [this video playlist](https://www.youtube.com/watch?v=1Hqy7cVkygU&list=PLv5wm4YuO4Iyx00ifs6xUwIRSFnBI8GZh).
- **[AutoDev](https://github.com/phodal/auto-dev)** — an AI-native multi-agent development platform built on Kotlin Multiplatform: wasm-git is the git backend for its WebAssembly target, powering clone, log, diff and status in [`GitOperations.wasmJs.kt`](https://github.com/phodal/auto-dev/blob/master/mpp-core/src/wasmJsMain/kotlin/cc/unitmesh/agent/platform/GitOperations.wasmJs.kt).
- **[githttpserver](https://github.com/petersalomonsen/githttpserver)** — a CORS-enabled git server you can host yourself, plus the browser playground at https://wasm-git.petersalomonsen.com/ showing basic operations: clone, edit, add, commit, push and pull.
- **[encrypted-git-storage](https://github.com/petersalomonsen/encrypted-git-storage)** — an addon that encrypts and decrypts repositories locally in the browser (AES-256-GCM); the server only ever sees ciphertext. Includes a remote helper for the native git client, so users can clone their own application data — decrypted, with full history — straight to their computer.

Wasm-git is also covered in the book [Building and Deploying WebAssembly Apps](https://bpbonline.com/products/building-and-deploying-webassembly-apps) (BPB Publications, 2025) by wasm-git author Peter Salomonsen.

# OPFS usage example

The pthreads OPFS version must run in a [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) because it requires [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) (for pthreads), which in turn requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`) HTTP headers.

**worker.js** (Web Worker):
```javascript
// Import the OPFS-enabled wasm-git module
const lgMod = await import('./lg2_opfs.js');
const lg = await lgMod.default();
const FS = lg.FS;

// WASMFS doesn't pre-create /home/web_user like MEMFS
try { FS.mkdir('/home'); } catch(e) {}
try { FS.mkdir('/home/web_user'); } catch(e) {}
FS.writeFile('/home/web_user/.gitconfig',
  '[user]\n  name = Your Name\n  email = your.email@example.com');

// Create an OPFS-backed directory using the WASMFS OPFS backend
const backend = lg._lg2_create_opfs_backend();
const workingDir = '/opfs';
// Use ccall to marshal the JS string to a C pointer
lg.ccall('lg2_create_directory', 'number', ['string', 'number', 'number'],
         [workingDir, 0o777, backend]);

// Clone using absolute path to avoid CWD ambiguity with WASMFS
const repoDir = workingDir + '/myrepo';
lg.callMain(['clone', 'https://github.com/user/repo.git', repoDir]);

// Work around a WASMFS getcwd() bug: create a root symlink so the path
// returned by getcwd() resolves correctly for libgit2's repo discovery.
FS.symlink(repoDir, '/myrepo');
FS.chdir(repoDir);

// Re-set CWD before each callMain since WASMFS may reset it
FS.chdir(repoDir);
FS.writeFile('newfile.txt', 'Hello OPFS!');
FS.chdir(repoDir);
lg.callMain(['add', 'newfile.txt']);
FS.chdir(repoDir);
lg.callMain(['commit', '-m', 'Add new file']);
FS.chdir(repoDir);
lg.callMain(['push']);

postMessage({ done: true });
```

See [test-browser-opfs/worker.js](./test-browser-opfs/worker.js) for a complete working example.

## OPFS variants and the runtime loader

OPFS's open/dir/metadata operations (`getFileHandle`, `getDirectoryHandle`,
`removeEntry`, `entries`, `createSyncAccessHandle`) are **async-only**. To call
them from libgit2's synchronous file IO, wasm-git ships three OPFS builds that
bridge async→sync in different ways:

| Build | File | Bridge | SharedArrayBuffer / cross-origin isolation | wasm size | Relative speed |
|-------|------|--------|--------------------------------------------|-----------|----------------|
| **pthreads / WASMFS** | `lg2_opfs.js` | WASMFS OPFS backend blocks a worker thread via `Atomics.wait` | **Required** (COOP/COEP) | ~920 KB | fastest |
| **JSPI** | `lg2_opfs_jspi.js` | [JSPI](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Suspending) — native WebAssembly stack switching | Not required | ~805 KB | fast |
| **ASYNCIFY** | `lg2_opfs_async.js` | [Asyncify](https://emscripten.org/docs/porting/asyncify.html) — wasm rewritten to unwind/rewind its stack | Not required | ~1.5 MB | slower (instrumentation overhead) |

(wasm sizes are for `-O3` release builds and will drift; JSPI is the smallest
because it needs no stack-rewriting instrumentation, ASYNCIFY the largest for the
same reason.)

The pthreads build needs `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`
headers (cross-origin isolation), which some hosts (e.g. NEAR web4) cannot set.
The **JSPI** and **ASYNCIFY** builds are *SAB-free*: they persist to OPFS by
suspending the wasm stack across the async OPFS calls, so they run with
`self.crossOriginIsolated === false`. All three must run inside a **Web Worker**
(OPFS sync access handles require one).

### Runtime loader (`lg2_opfs_auto.js`)

`lg2_opfs_auto.js` picks the most optimal supported build at runtime and exposes
a uniform git API over all three. Selection order:

1. **pthreads** when the page is cross-origin isolated
   (`crossOriginIsolated === true` and `SharedArrayBuffer` exists);
2. **JSPI** when available (`WebAssembly.Suspending` / `WebAssembly.promising`);
3. **ASYNCIFY** otherwise (universal fallback).

If OPFS itself is unavailable (`navigator.storage.getDirectory` missing, insecure
context), `selectOpfsVariant()` returns `null` — fall back to the non-OPFS IDBFS
build (`lg2.js`).

```javascript
// inside a Web Worker (type: 'module')
import { loadOpfsGit, selectOpfsVariant } from './lg2_opfs_auto.js';

console.log(selectOpfsVariant());      // 'pthreads' | 'jspi' | 'asyncify' | null

const git = await loadOpfsGit({ user: 'Your Name', email: 'you@example.com' });
console.log(git.variant);              // which build was loaded

await git.clone('https://example.com/repo.git', 'repo.git');
await git.writeFile('repo.git', 'a.txt', 'hello');
await git.addCommitPush('repo.git', 'a.txt', 'add a.txt');
console.log(git.readFile('repo.git', 'a.txt'));   // 'hello'

// After a reload, restore an existing repo from OPFS before using it:
await git.syncRepo('repo.git');
```

The detection helpers (`detectOpfsEnvironment`, `selectOpfsVariant`) are pure
functions that accept an `env` object, so they can be unit-tested or forced
(see [test/opfs-detect.spec.js](./test/opfs-detect.spec.js)).

See [test-browser-opfs-noniso/worker.js](./test-browser-opfs-noniso/worker.js)
for a complete worker built on the loader.

# Filesystem backends

Wasm-git supports multiple filesystem backends for different use cases:

### MEMFS (Memory File System)
- **Use case**: In-memory storage, not persisted
- **Build target**: Default (`./build.sh Release`)
- **Browser support**: All browsers

### IDBFS (IndexedDB File System)
- **Use case**: Browser persistent storage using IndexedDB
- **Build target**: Default (`./build.sh Release`)
- **Browser support**: All browsers with IndexedDB

### NODEFS (Node.js File System)
- **Use case**: Node.js native filesystem access
- **Build target**: Default (`./build.sh Release`)
- **Platform**: Node.js only

### OPFS (Origin Private File System)
- **Use case**: Modern browser persistent storage with better performance and quota management
- **Browser support**: Chrome 86+, Edge 86+, Firefox 111+, Safari 15.2+ (JSPI variant: Chromium-based browsers with JSPI)
- **Advantages**: Better performance and quota compared to IDBFS
- **Requirements**: Must run in a Web Worker (OPFS sync access handles require one)
- **Three variants** — see [OPFS variants and the runtime loader](#opfs-variants-and-the-runtime-loader):
  - **pthreads / WASMFS** (`./build.sh Release-opfs` → `lg2_opfs.js`): synchronous `callMain`; requires cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`/`credentialless`) for SharedArrayBuffer.
  - **JSPI** (`./build.sh Release-opfs-jspi` → `lg2_opfs_jspi.js`): SAB-free; async `callMain`; smallest binary.
  - **ASYNCIFY** (`./build.sh Release-opfs-async` → `lg2_opfs_async.js`): SAB-free; async `callMain`; universal fallback, largest binary.
  - `lg2_opfs_auto.js` selects the best supported variant at runtime.

# Building and developing

## Compatibility

- **libgit2**: v1.9.4
- **Emscripten**: Pinned to 6.0.3
- **Node.js**: v18+
- **Browsers**: Modern browsers with WebAssembly support

## Prerequisites

- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (version 6.0.3)
- Node.js (v18 or higher)
- CMake
- Make

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/petersalomonsen/wasm-git.git
   cd wasm-git
   ```

2. **Install and activate Emscripten**
   ```bash
   git clone https://github.com/emscripten-core/emsdk.git
   cd emsdk
   ./emsdk install 6.0.3
   ./emsdk activate 6.0.3
   source ./emsdk_env.sh
   cd ..
   ```

3. **Set up libgit2**
   ```bash
   ./setup.sh
   ```
   This script downloads libgit2 v1.9.4 and applies necessary patches for WebAssembly compilation.

4. **Build the project**
   ```bash
   cd emscriptenbuild
   ./build.sh         # Debug build (smaller, for development)
   ./build.sh Release # Release build (optimized)
   ```

   For async versions (with Asyncify support):
   ```bash
   ./build.sh Debug-async   # Debug async build
   ./build.sh Release-async # Release async build
   ```

   For OPFS versions:
   ```bash
   ./build.sh Release-opfs       # pthreads / WASMFS OPFS build (needs COOP/COEP)
   ./build.sh Release-opfs-jspi  # SAB-free OPFS build using JSPI
   ./build.sh Release-opfs-async # SAB-free OPFS build using ASYNCIFY
   # (Debug-opfs, Debug-opfs-jspi and Debug-opfs-async also exist)
   ```

5. **Install npm dependencies**
   ```bash
   npm install
   ```

6. **Run tests**
   ```bash
   npm test                         # Run Node.js tests
   npm run test-browser             # Run browser tests (sync version)
   npm run test-browser-async       # Run browser tests (async version)
   npm run test-browser-opfs        # OPFS pthreads/WASMFS tests (cross-origin isolated)
   npm run test-browser-opfs-noniso # SAB-free OPFS tests (ASYNCIFY + JSPI, non-isolated)
   npm run test-opfs-detect         # Loader variant-detection unit tests
   npm run test-opfs-loader         # Multi-browser loader selection tests (Chromium/Firefox/WebKit)
   ```

## Development Options

### GitHub Codespaces

The easiest way to get started is using GitHub Codespaces. The repository includes a [.devcontainer](./.devcontainer) configuration that automatically sets up the complete development environment with all dependencies.

### Local Development

The [Github actions test pipeline](./.github/workflows/main.yml) shows all the commands needed for CI/CD and can be used as a reference for local setup.

## Build Outputs

After building, you'll find the following files in `emscriptenbuild/libgit2/examples/`:
- `lg2.js` and `lg2.wasm` - Synchronous version
- `lg2_async.js` and `lg2_async.wasm` - Asynchronous version with Asyncify
- `lg2_opfs.js` and `lg2_opfs.wasm` - OPFS version with WASMFS + pthreads
- `lg2_opfs_jspi.js` and `lg2_opfs_jspi.wasm` - SAB-free OPFS version using JSPI
- `lg2_opfs_async.js` and `lg2_opfs_async.wasm` - SAB-free OPFS version using ASYNCIFY

The runtime loader `lg2_opfs_auto.js` (a hand-written module, not a build output)
selects the best of the three OPFS builds at runtime — see
[OPFS variants and the runtime loader](#opfs-variants-and-the-runtime-loader).

These files are also available from npm packages and CDNs for production use.

## Troubleshooting

1. **Build errors**: Ensure the Emscripten environment is properly activated:
   ```bash
   source /path/to/emsdk/emsdk_env.sh
   ```

2. **Test failures**: Remove any stale test directories before running tests:
   ```bash
   rm -rf nodefsclonetest
   npm test
   ```

# History

Wasm-git started in 2020, and getting libgit2 to run in a JavaScript environment required several fixes to Emscripten itself, all merged upstream that year:
[#10095](https://github.com/emscripten-core/emscripten/pull/10095),
[#10526](https://github.com/emscripten-core/emscripten/pull/10526),
[#10782](https://github.com/emscripten-core/emscripten/pull/10782)
and [#10669](https://github.com/emscripten-core/emscripten/pull/10669) (NODEFS support).
