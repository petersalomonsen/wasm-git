#!/bin/bash
set -e
echo "copy lg2.wasm and lg2.js from build folder"
cp emscriptenbuild/libgit2/examples/lg2.wasm .
cp emscriptenbuild/libgit2/examples/lg2.js .
cp emscriptenbuild/libgit2/examples/lg2_async.wasm .
cp emscriptenbuild/libgit2/examples/lg2_async.js .
cp emscriptenbuild/libgit2/examples/lg2_opfs.wasm .
cp emscriptenbuild/libgit2/examples/lg2_opfs.js .
cp emscriptenbuild/libgit2/examples/lg2_opfs_async.wasm .
cp emscriptenbuild/libgit2/examples/lg2_opfs_async.js .
cp emscriptenbuild/libgit2/examples/lg2_opfs_jspi.wasm .
cp emscriptenbuild/libgit2/examples/lg2_opfs_jspi.js .
cp emscriptenbuild/libgit2/examples/lg2_workerfs.wasm .
cp emscriptenbuild/libgit2/examples/lg2_workerfs.js .
# lg2_opfs_auto.js is a hand-written source file already at the repo root
echo "npm package prepared"
