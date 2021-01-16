#!/bin/bash

BUILD_TYPE=Debug
ASYNCIFY_FLAGS=" -s ASYNCIFY -s 'ASYNCIFY_IMPORTS=[\"emscriptenhttp_do_get\", \"emscriptenhttp_do_read\", \"emscriptenhttp_do_post\"]' "
POST_JS="--post-js $(pwd)/post.js"

# Reset in case we've done an '-async' build
cp ../libgit2patchedfiles/src/transports/emscriptenhttp.c ../libgit2/src/transports/emscriptenhttp.c

# Set build type to Release for release
if [ "$1" == "Release" ]; then
    BUILD_TYPE=Release
    EXTRA_CMAKE_C_FLAGS="-Oz"
fi

# For async transports we overwrite emscripenhttp.c, use post-async.js and change the extra flags
if [ "$1" == "Release-async" ]; then
    BUILD_TYPE=Release
    cp ../libgit2patchedfiles/src/transports/emscriptenhttp-async.c ../libgit2/src/transports/emscriptenhttp.c

    EXTRA_CMAKE_C_FLAGS="-O3 $ASYNCIFY_FLAGS"
    POST_JS="--post-js $(pwd)/post-async.js"
elif [ "$1" == "Debug-async" ]; then
    BUILD_TYPE=Debug
    cp ../libgit2patchedfiles/src/transports/emscriptenhttp-async.c ../libgit2/src/transports/emscriptenhttp.c

    EXTRA_CMAKE_C_FLAGS="$ASYNCIFY_FLAGS"
    POST_JS="--post-js $(pwd)/post-async.js"
fi

# Before building, remove any ../libgit2/src/transports/emscriptenhttp.c left from running setup.sh 
[ -f "../libgit2/src/transports/emscriptenhttp-async.c" ] && rm ../libgit2/src/transports/emscriptenhttp-async.c

emcmake cmake -DCMAKE_BUILD_TYPE=$BUILD_TYPE -DCMAKE_C_FLAGS="$EXTRA_CMAKE_C_FLAGS  --pre-js $(pwd)/pre.js $POST_JS -s \"EXTRA_EXPORTED_RUNTIME_METHODS=['FS','callMain']\" -lnodefs.js -lidbfs.js -s INVOKE_RUN=0 -s ALLOW_MEMORY_GROWTH=1" -DREGEX_BACKEND=regcomp -DSONAME=OFF -DUSE_HTTPS=OFF -DBUILD_SHARED_LIBS=OFF -DTHREADSAFE=OFF -DUSE_SSH=OFF -DBUILD_CLAR=OFF -DBUILD_EXAMPLES=ON ../libgit2
emcmake cmake -build ../libgit2
emmake make
