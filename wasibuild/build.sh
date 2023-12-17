#!/bin/bash
BUILD_TYPE=Debug

# Set build type to Release for release
if [ "$1" == "Release" ]; then
    BUILD_TYPE=Release
    EXTRA_CMAKE_C_FLAGS="-Oz"
fi

clang --target=wasm32-wasi --sysroot=wasi-sdk-20.0/share/wasi-sysroot -D_WASI_EMULATED_MMAN -Iwasi_mocks -c wasi_mocks/pwd.c -o wasi_mocks/pwd.o
cmake -DCMAKE_TOOLCHAIN_FILE=`pwd`/wasi_toolchain.cmake -DCMAKE_BUILD_TYPE=$BUILD_TYPE -DCMAKE_C_FLAGS="$EXTRA_CMAKE_C_FLAGS" -DREGEX_BACKEND=regcomp -DSONAME=OFF -DUSE_HTTPS=OFF -DBUILD_SHARED_LIBS=OFF -DUSE_THREADS=OFF -DUSE_SSH=OFF -DBUILD_CLAR=OFF -DBUILD_EXAMPLES=ON ../libgit2
make lg2 VERBOSE=1

