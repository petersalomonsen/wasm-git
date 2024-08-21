cd /src/wasm-git
rm -rf libgit2
rm -rf emscriptenbuild/libgit2
rm -rf emscriptenbuild/CMakeFiles
rm -f emscriptenbuild/lg2.wasm
rm -f emscriptenbuild/lg2.js
rm -f emscriptenbuild/cmake_install.cmake
rm -f emscriptenbuild/CMakeCache.txt
rm -f emscriptenbuild/Makefile
npm install
sh setup.sh
source /src/emsdk/emsdk_env.sh
cd /src/wasm-git/emscriptenbuild
./build.sh "$@"