Wasm-git
========
(Wasm should be pronounced like `awesome` starting with a `W` ).

![](https://github.com/petersalomonsen/wasm-git/actions/workflows/main.yml/badge.svg)

GIT for nodejs and the browser using [libgit2](https://libgit2.org/) compiled to WebAssembly with [Emscripten](https://emscripten.org).

The main purpose of bringing git to the browser, is to enable storage of web application data locally in the users web browser, with the option to synchronize with a remote server.

## Compatibility

- **libgit2**: v1.7.1
- **Emscripten**: Pinned to 4.0.23
- **Node.js**: v18+
- **Browsers**: Modern browsers with WebAssembly support

# Demo in the browser

A simple demo in the browser can be found at:

https://wasm-git.petersalomonsen.com/

**Please do not abuse, this is open for you to test and see the proof of concept**

The sources for the demo can be found in the [githttpserver](https://github.com/petersalomonsen/githttpserver) project. It shows basic operations like cloning, edit files, add and commit, push and pull.

# Demo videos

Videos showing example applications using wasm-git can bee seen in [this playlist](https://www.youtube.com/watch?v=1Hqy7cVkygU&list=PLv5wm4YuO4Iyx00ifs6xUwIRSFnBI8GZh). Wasm-git is used for local and offline storage of web application data, and for syncing with a remote server.

# Examples

Wasm-git packages are built in three variants: Synchronous, Asynchronous, and OPFS. To run the sync version in the browser, a [webworker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) is needed. This is because of the use of synchronous http requests and long running operations that would block if running on the main thread. The sync version has the smallest binary, but need extra client code to communicate with the web worker. When using the sync version in nodejs [worker_threads](https://nodejs.org/api/worker_threads.html) are used, with [Atomics](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics) to exchange data between threads.

The async version use [Emscripten Asyncify](https://emscripten.org/docs/porting/asyncify.html), which allows calling the Wasm-git functions with `async` / `await`. It can also run from the main thread in the browser. Asyncify increase the binary size because of instrumentation to unwind and rewind WebAssembly state, but makes it possible to have simple client code without exchanging data with worker threads like in the sync version.

The OPFS version stores data in the browser's [Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) (OPFS), which provides better performance and quota management than IDBFS. OPFS's directory/metadata operations are **async-only**, so reaching them from synchronous libgit2 code needs an async bridge. wasm-git ships **three** OPFS variants that bridge it differently — see [OPFS variants](#opfs-variants-and-the-runtime-loader) below.

Examples of using Wasm-git can be found in the tests:

- [test](./test/) for NodeJS
- [test-browser](./test-browser/) for the sync version in the browser with a web worker
- [test-browser-async](./test-browser-async/) for the async version in the browser
- [test-browser-opfs](./test-browser-opfs/) for the OPFS (pthreads/WASMFS) version in the browser
- [test-browser-opfs-noniso](./test-browser-opfs-noniso/) for the SAB-free OPFS variants (ASYNCIFY + JSPI) and the runtime loader

The examples shows importing the `lg2.js` / `lg2_async.js` / `lg2_opfs.js` modules from the local build, but you may also access these from releases available at public CDNs.

## OPFS Usage Example

The OPFS version must run in a [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) because it requires [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) (for pthreads), which in turn requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`) HTTP headers.

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

# Building and developing

## Prerequisites

- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (version 4.0.23)
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
   ./emsdk install 4.0.23
   ./emsdk activate 4.0.23
   source ./emsdk_env.sh
   cd ..
   ```

3. **Set up libgit2**
   ```bash
   ./setup.sh
   ```
   This script downloads libgit2 v1.7.1 and applies necessary patches for WebAssembly compilation.

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

## Filesystem Backends

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

## Troubleshooting

### Common Issues

1. **`writeArrayToMemory` errors**: Make sure you're using a compatible Emscripten version (3.1.74+). The project has been updated to use `Module.HEAPU8.set()` instead.

2. **Build errors**: Ensure Emscripten environment is properly activated:
   ```bash
   source /path/to/emsdk/emsdk_env.sh
   ```

3. **Test failures**: Remove any stale test directories before running tests:
   ```bash
   rm -rf nodefsclonetest
   npm test
   ```

# Emscripten fixes that were needed for making Wasm-git work

As part of being able to compile libgit2 to WebAssembly and run it in a Javascript environment, some fixes to [Emscripten](https://emscripten.org/) were needed.

Here are the Pull Requests that resolved the issues identified when the first version was developed:

- https://github.com/emscripten-core/emscripten/pull/10095
- https://github.com/emscripten-core/emscripten/pull/10526
- https://github.com/emscripten-core/emscripten/pull/10782

for using with `NODEFS` you'll also need https://github.com/emscripten-core/emscripten/pull/10669

All of these pull requests are merged to emscripten master as of 2020-03-29.

