Wasm-git
========
(Wasm should be pronounced like `awesome` starting with a `W` ).

![](https://github.com/petersalomonsen/wasm-git/actions/workflows/main.yml/badge.svg)

GIT for nodejs and the browser using [libgit2](https://libgit2.org/) compiled to WebAssembly with [Emscripten](https://emscripten.org).

The main purpose of bringing git to the browser, is to enable storage of web application data locally in the users web browser, with the option to synchronize with a remote server.

## Compatibility

- **libgit2**: v1.7.1
- **Emscripten**: Tested with 4.0.13 (compatible with 3.1.74+)
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

The OPFS version also uses Asyncify and adds support for Emscripten's WASMFS with the OPFS (Origin Private File System) backend. OPFS provides better performance and quota management compared to IDBFS, making it ideal for modern browser-based applications that need persistent storage.

Examples of using Wasm-git can be found in the tests:

- [test](./test/) for NodeJS
- [test-browser](./test-browser/) for the sync version in the browser with a web worker
- [test-browser-async](./test-browser-async/) for the async version in the browser
- [test-browser-opfs](./test-browser-opfs/) for the OPFS version in the browser

The examples shows importing the `lg2.js` / `lg2_async.js` / `lg2_opfs.js` modules from the local build, but you may also access these from releases available at public CDNs.

## OPFS Usage Example

```javascript
// Import the OPFS-enabled wasm-git module
const lgMod = await import('./lg2_opfs.js');
const lg = await lgMod.default();
const FS = lg.FS;

// Create and mount an OPFS filesystem
const workingDir = '/working';
FS.mkdir(workingDir);
FS.mount(FS.filesystems.OPFS, { root: '.' }, workingDir);
FS.chdir(workingDir);

// Configure git
FS.writeFile('/home/web_user/.gitconfig', '[user]\n' +
    'name = Your Name\n' +
    'email = your.email@example.com');

// Use git commands with async/await
await lg.callMain(['clone', 'https://github.com/user/repo.git', 'repo']);
FS.chdir('repo');
FS.writeFile('newfile.txt', 'Hello OPFS!');
await lg.callMain(['add', 'newfile.txt']);
await lg.callMain(['commit', '-m', 'Add new file']);
await lg.callMain(['push']);
```

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

   For OPFS versions (with WASMFS and OPFS support):
   ```bash
   ./build.sh Debug-opfs   # Debug OPFS build
   ./build.sh Release-opfs # Release OPFS build
   ```

5. **Install npm dependencies**
   ```bash
   npm install
   ```

6. **Run tests**
   ```bash
   npm test                  # Run Node.js tests
   npm run test-browser      # Run browser tests (sync version)
   npm run test-browser-async # Run browser tests (async version)
   npm run test-browser-opfs # Run browser tests (OPFS version)
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
- `lg2_opfs.js` and `lg2_opfs.wasm` - OPFS version with WASMFS

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

### OPFS (Origin Private File System via WASMFS)
- **Use case**: Modern browser persistent storage with better performance and quota management
- **Build target**: OPFS builds (`./build.sh Release-opfs` or `./build.sh Debug-opfs`)
- **Browser support**: 
  - Chrome 86+
  - Edge 86+
  - Firefox 111+
  - Safari 15.2+
- **Advantages**: Better performance and quota compared to IDBFS
- **Note**: Uses Emscripten's WASMFS with OPFS backend, requires async/await like the async build

## Test Status

All tests are currently passing:
- ✅ Node.js tests: 6/6 passing
- ✅ Browser tests (sync): 18/18 passing
- ✅ Browser async tests: Should work similarly to sync version

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

