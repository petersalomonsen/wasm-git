#!/bin/bash
curl https://wasmtime.dev/install.sh -sSf | bash
npm install
sh setup.sh

git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
git pull
./emsdk install latest
./emsdk activate latest
cd ..

sudo apt update
sudo apt install -y clang-12
sudo apt install -y lld-12
sudo update-alternatives --install /usr/bin/clang clang /usr/bin/clang-12 100
sudo update-alternatives --install /usr/bin/clang++ clang++ /usr/bin/clang++-12 100

sudo ln -s /usr/bin/wasm-ld-12 /usr/bin/wasm-ld

cd wasibuild

wget https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-20/wasi-sdk-20.0-linux.tar.gz
tar -xvzf wasi-sdk-20.0-linux.tar.gz
sudo cp -r wasi-sdk-20.0/lib/clang/16/lib/wasi /usr/lib/llvm-12/lib/clang/12.0.0/lib/

cd ..

curl https://wasmtime.dev/install.sh -sSf | bash
