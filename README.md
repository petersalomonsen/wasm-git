WASM-GIT
========
(WASM should be pronounced like `awesome` starting with a `W` ).

![](https://travis-ci.com/petersalomonsen/wasm-git.svg?branch=master)

GIT for nodejs and the browser using [libgit2](https://libgit2.org/) compiled to WebAssembly with [Emscripten](https://emscripten.org).

# Demo in the browser

A simple demo in the browser can be found at:

https://wasm-git.petersalomonsen.com/

**Please do not abuse, this is open for you to test and see the proof of concept**

The sources for the demo can be found in the [githttpserver](https://github.com/petersalomonsen/githttpserver) project, which is a simple git server deployable to [kubernetes](https://github.com/kubernetes/kubernetes). Showing basic operations like cloning, edit files, add and commit, push and pull.

# Example WebWorker with pre built binaries

For running in the browser you should have your git interaction code in a [webworker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers). This is because of the use of synchronous http requests and long running operations that would block if running on the main thread.

Here's an example of a simple webworker that uses pre-built binaries from https://unpkg.com/wasm-git@0.0.1/

```js
var Module = {
    locateFile: function(s) {
      return 'https://unpkg.com/wasm-git@0.0.2/' + s;
    }
};

importScripts('https://unpkg.com/wasm-git@0.0.2/lg2.js');

Module.onRuntimeInitialized = () => {
    const lg = Module;

    FS.mkdir('/working');
    FS.mount(MEMFS, { }, '/working');
    FS.chdir('/working');    

    FS.writeFile('/home/web_user/.gitconfig', '[user]\n' +
                'name = Test User\n' +
                'email = test@example.com');

    // clone a local git repository and make some commits

    lg.callMain(['clone',`http://localhost:5000/test.git`, 'testrepo']);

    FS.readdir('testrepo');
}
```

You'll start the worker from your html with the tag:

`<script>new Worker('yourworker.js')</script>;`

The example above expects to find a git repository at `http://localhost:5000/test.git`. If you want to clone from github you'd need a proxy running locally because of [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) restrictions that would prevent you
accessing github directly. For testing you can use the proxy found in [examples/webserverwithgithubproxy.js](examples/webserverwithgithubproxy.js)

# Use in Browser without a WebWorker
A webworker is more performant but for cases where you really need to work in the browser, the http requests must be asynchronous and not synchronous as in the default builds.

If you use the `emscriptenbuilds/build.sh` you can build `async` versions with:
```
./build.sh Release-async
```
and
```
./build.sh Debug-async
```
To use the async wasm-git build you need to load `lg2.js` using a `<script>` tag in HTML, and set up a method to wait for initialisation of the lg2 module. For example, your `index.html` can include the following, and set up a promise for your JavaScript implementation to `await`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
	<script src='/build/lg2.js'></script>
  
	<script>
	window.lg2Ready = false;
	window.lg2 = Module;
	window.lg2ReadyPromise = new Promise((resolve) => {
		Module.onRuntimeInitialized = () => {
			window.lg2Ready = true;
			resolve(true);
		};
	});
	</script>

<script defer src='/build/bundle.js'></script>
</head>

<body>
</body>
</html>
```
In your bundle, you will have JavaScript to `await window.lg2ReadyPromise` and can then use `await callMain()` to invoke `libgit2` features exposed by `wasm-git`. Notice you MUST use `await` on every `callMain()` which interacts with a remote repository (e.g. 'clone', 'push' and so on). Example:
```javascript
async function initApp() {
	await window.lg2ReadyPromise;
	await test();
}

async function test() {
	const lg = window.lg2;
    const FS = lg.FS;

    const lg = Module;

    FS.mkdir('/working');
    FS.mount(MEMFS, { }, '/working');
    FS.chdir('/working');    

    FS.writeFile('/home/web_user/.gitconfig', '[user]\n' +
                'name = Test User\n' +
                'email = test@example.com');

    // clone a local git repository and make some commits

    await lg.callMain(['clone',`http://localhost:5000/test.git`, 'testrepo']);

    FS.readdir('testrepo');
}

```

Note that the compiled output is about twice the size for non-async builds, and that git operations will take place on the main thread which can affect reponsiveness of your web UI.

See below for more details on building using `build.sh`.
# Use from nodejs with pre built binaries

You may install the npm package containing the binaries:

`npm install wasm-git`

example source code for cloning a repository from github:

```js
const lg = require('./node_modules/wasm-git/lg2.js');

lg.onRuntimeInitialized = () => {
    const FS = lg.FS;
    const MEMFS = FS.filesystems.MEMFS;

    FS.mkdir('/working');
    FS.mount(MEMFS, { }, '/working');
    FS.chdir('/working');    

    FS.writeFile('/home/web_user/.gitconfig', '[user]\n' +
                'name = Test User\n' +
                'email = test@example.com');
    
    // clone a repository from github
    lg.callMain(['clone','https://github.com/torch2424/made-with-webassembly.git', 'made-with-webassembly']);
    FS.readdir('made-with-webassembly');
}
```

# Building

**IMPORTANT: This depends on the following mmap fixes for emscripten:**

- https://github.com/emscripten-core/emscripten/pull/10095
- https://github.com/emscripten-core/emscripten/pull/10526
- https://github.com/emscripten-core/emscripten/pull/10782

for using with `NODEFS` you'll also need https://github.com/emscripten-core/emscripten/pull/10669

All of these pull requests are merged to emscripten master as of 2020-03-29.

See [.travis.yml](.travis.yml) for a full build and test pipeline including installing emscripten.

Run [setup.sh](setup.sh) first to download libgit2 and apply patches.

Given you have installed and activated emscripten, you can use the script in [emscriptenbuild/build.sh](emscriptenbuild/build.sh) to configure and build, and you'll find the resulting `lg2.js` / `lg2.wasm` under the generated `emscriptenbuild/examples` folder.

An example of interacting with libgit2 from nodejs can be found in [examples/example_node.js](examples/example_node.js).

An example for the browser (using webworkers) can be found in [examples/example_webworker.js](examples/example_webworker.js). You can start a webserver for this by running the [examples/webserverwithgithubproxy.js](examples/webserverwithgithubproxy.js) script, which will launch a http server at http://localhost:5000 with a proxy to github. Proxy instead of direct calls is needed because of CORS restrictions in a browser environment.
