#!/bin/bash

# Set build type to Release for release
if [ "$1" == "Release" ]; then
    BUILD_TYPE=$1
    EXTRA_CMAKE_C_FLAGS="-Oz"
else
    BUILD_TYPE=Debug
fi

emcmake cmake -DCMAKE_BUILD_TYPE=$BUILD_TYPE -DCMAKE_C_FLAGS="$EXTRA_CMAKE_C_FLAGS --post-js $(pwd)/post.js -s \"EXTRA_EXPORTED_RUNTIME_METHODS=['FS','callMain']\" -lnodefs.js -lidbfs.js -s INVOKE_RUN=0 -s ALLOW_MEMORY_GROWTH=1" -DREGEX_BACKEND=regcomp -DSONAME=OFF -DUSE_HTTPS=OFF -DBUILD_SHARED_LIBS=OFF -DTHREADSAFE=OFF -DUSE_SSH=OFF -DBUILD_CLAR=OFF -DBUILD_EXAMPLES=ON ../libgit2
emcmake cmake -build ../libgit2
emmake make
