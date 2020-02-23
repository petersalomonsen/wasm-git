WASM-GIT
========
(WASM should be pronounced like `awesome` starting with a `W` ).

GIT for nodejs and the browser using [libgit2](https://libgit2.org/) compiled to WebAssembly with [Emscripten](https://emscripten.org).

# Demo

A simple demo in the browser can be found at:

https://githttpserverdemo.petersalomonsen.usw1.kubesail.io/

**Please do not abuse, this is open for you to test and see the proof of concept**

# Building

**IMPORTANT: This depends on the following mmap fixes for emscripten:**

- https://github.com/emscripten-core/emscripten/pull/10095
- https://github.com/emscripten-core/emscripten/pull/10526

Run [setup.sh](setup.sh) first to download libgit2 and apply patches.

The script in [emscriptenbuild/build.sh](emscriptenbuild/build.sh) shows how to configure and build, and you'll find the resulting `lg2.js` / `lg2.wasm` under the generated `emscriptenbuild/examples` folder.

An example of interacting with libgit2 from nodejs can be found in [examples/example_node.js](examples/example_node.js).

An example for the browser (using webworkers) can be found in [examples/example_webworker.js](examples/example_webworker.js). You can start a webserver for this by running the [examples/webserverwithgithubproxy.js](examples/webserverwithgithubproxy.js) script, which will launch a http server at http://localhost:5000 with a proxy to github. Proxy instead of direct calls is needed because of CORS restrictions in a browser environment.
