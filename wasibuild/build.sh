#!/bin/bash
BUILD_TYPE=Debug

# Set build type to Release for release
if [ "$1" == "Release" ]; then
    BUILD_TYPE=Release
    EXTRA_CMAKE_C_FLAGS="-Oz"
fi

cmake -DCMAKE_TOOLCHAIN_FILE=`pwd`/wasi_toolchain.cmake -DCMAKE_BUILD_TYPE=$BUILD_TYPE -DCMAKE_C_FLAGS="$EXTRA_CMAKE_C_FLAGS" -DREGEX_BACKEND=regcomp -DSONAME=OFF -DUSE_HTTPS=OFF -DBUILD_SHARED_LIBS=OFF -DUSE_THREADS=OFF -DUSE_SSH=OFF -DBUILD_CLAR=OFF -DBUILD_EXAMPLES=ON ../libgit2
make lg2 VERBOSE=1
