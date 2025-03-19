Wasm-git
========
(Wasm should be pronounced like `awesome` starting with a `W` ).

![](https://github.com/petersalomonsen/wasm-git/actions/workflows/main.yml/badge.svg)

GIT for nodejs and the browser using [libgit2](https://libgit2.org/) compiled to WebAssembly with [Emscripten](https://emscripten.org).

The main purpose of bringing git to the browser, is to enable storage of web application data locally in the users web browser, with the option to synchronize with a remote server.

# Demo in the browser

A simple demo in the browser can be found at:

https://wasm-git.petersalomonsen.com/

**Please do not abuse, this is open for you to test and see the proof of concept**

The sources for the demo can be found in the [githttpserver](https://github.com/petersalomonsen/githttpserver) project. It shows basic operations like cloning, edit files, add and commit, push and pull.

# Demo videos

Videos showing example applications using wasm-git can bee seen in [this playlist](https://www.youtube.com/watch?v=1Hqy7cVkygU&list=PLv5wm4YuO4Iyx00ifs6xUwIRSFnBI8GZh). Wasm-git is used for local and offline storage of web application data, and for syncing with a remote server.

# Examples

Wasm-git packages are built in two variants: Synchronuous and Asynchronuous. To run the sync version in the browser, a [webworker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) is needed. This is because of the use of synchronous http requests and long running operations that would block if running on the main thread. The sync version has the smallest binary, but need extra client code to communicate with the web worker. When using the sync version in nodejs [worker_threads](https://nodejs.org/api/worker_threads.html) are used, with [Atomics](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics) to exchange data between threads.

The async version use [Emscripten Asyncify](https://emscripten.org/docs/porting/asyncify.html), which allows calling the Wasm-git functions with `async` / `await`. It can also run from the main thread in the browser. Asyncify increase the binary size because of instrumentation to unwind and rewind WebAssembly state, but makes it possible to have simple client code without exchanging data with worker threads like in the sync version.

Examples of using Wasm-git can be found in the tests:

- [test](./test/) for NodeJS
- [test-browser](./test-browser/) for the sync version in the browser with a web worker
- [test-browser-async](./test-browser-async/)] for the async version in the browser

The examples shows importing the `lg2.js` / `lg2-async.js` modules from the local build, but you may also access these from releases available at public CDNs.

# Building and developing

The [Github actions test pipeline](./.github/workflows/main.yml) shows all the commands needed to install dependencies, build the packages and run the tests.

Another option is loading the repository into a github codespace, where the configuration in [.devcontainer](./.devcontainer) folder will be used to install dependencies and set up a full development environment.

# Emscripten fixes that were needed for making Wasm-git work

As part of being able to compile libgit2 to WebAssembly and run it in a Javascript environment, some fixes to [Emscripten](https://emscripten.org/) were needed.

Here are the Pull Requests that resolved the issues identified when the first version was developed:

- https://github.com/emscripten-core/emscripten/pull/10095
- https://github.com/emscripten-core/emscripten/pull/10526
- https://github.com/emscripten-core/emscripten/pull/10782

for using with `NODEFS` you'll also need https://github.com/emscripten-core/emscripten/pull/10669

All of these pull requests are merged to emscripten master as of 2020-03-29.

See [.github/workflows/main.yml](./.github/workflows/main.yml) for a full build and test pipeline including installing emscripten.

Run [setup.sh](setup.sh) first to download libgit2 and apply patches.

Given you have installed and activated emscripten, you can use the script in [emscriptenbuild/build.sh](emscriptenbuild/build.sh) to configure and build, and you'll find the resulting `lg2.js` / `lg2.wasm` under the generated `emscriptenbuild/examples` folder.

An example of interacting with libgit2 from nodejs can be found in [examples/example_node.js](examples/example_node.js).

An example for the browser (using webworkers) can be found in [examples/example_webworker.js](examples/example_webworker.js). You can start a webserver for this by running the [examples/webserverwithgithubproxy.js](examples/webserverwithgithubproxy.js) script, which will launch a http server at http://localhost:5000 with a proxy to github. Proxy instead of direct calls is needed because of CORS restrictions in a browser environment.

## Docker build

Build image in repository directory:

```bash
docker build -t wasm-git-image .
```

Example Release build and SINGLE_FILE parameter:

```bash
docker run -v .:/src/wasm-git --rm wasm-git-image /bin/bash -c "cd /src/wasm-git && git ls-files | xargs dos2unix && /src/wasm-git/docker_cleanup_and_build.sh Release SINGLE_FILE"
```

After build outputs can be found in emscriptenbuild/libgit2/examples/lg2.js and and in case no SINGLE_FILE parameter was provided also emscriptenbuild/libgit2/examples/lg2.wasm.
