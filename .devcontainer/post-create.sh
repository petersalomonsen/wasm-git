#!/bin/bash
curl https://wasmtime.dev/install.sh -sSf | bash
npm install
sh setup.sh

git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
git pull
./emsdk install 4.0.23
./emsdk activate 4.0.23
cd ..

npx playwright install-deps
npx playwright install