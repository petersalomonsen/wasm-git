#!/bin/bash

npm install
sh setup.sh

git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
git pull
./emsdk install latest
./emsdk activate latest
cd ..
