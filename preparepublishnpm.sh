#!/bin/bash
set -e
echo "copy lg2.wasm and lg2.js from build folder"
cp emscriptenbuild/examples/lg2.wasm .
cp emscriptenbuild/examples/lg2.js .
echo "publish --dry-run (run npm publish to finalize)"
npm publish --dry-run
