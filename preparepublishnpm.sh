#!/bin/bash
set -e
echo "copy lg2.wasm and lg2.js from build folder"
cp emscriptenbuild/libgit2/examples/lg2.wasm .
cp emscriptenbuild/libgit2/examples/lg2.js .
cp emscriptenbuild/libgit2/examples/lg2_async.wasm .
cp emscriptenbuild/libgit2/examples/lg2_async.js .
cp emscriptenbuild/libgit2/examples/lg2_opfs.wasm .
cp emscriptenbuild/libgit2/examples/lg2_opfs.js .
echo "npm package prepared"
