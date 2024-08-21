#!/bin/bash

BUILD_TYPE=Debug
ASYNCIFY_FLAGS=" -s ASYNCIFY -s 'ASYNCIFY_IMPORTS=[\"emscriptenhttp_do_get\", \"emscriptenhttp_do_read\", \"emscriptenhttp_do_post\"]' "
POST_JS="--post-js $(pwd)/post.js"

# Reset in case we've done an '-async' build
cp ../libgit2patchedfiles/src/transports/emscriptenhttp.c ../libgit2/src/libgit2/transports/emscriptenhttp.c

export LG2_OUTPUT_NAME=lg2

# Set build type to Release for release
if [ "$1" == "Release" ]; then
    BUILD_TYPE=Release
    EXTRA_CMAKE_C_FLAGS="-Oz"
fi

# For async transports we overwrite emscripenhttp.c, use post-async.js and change the extra flags
if [ "$1" == "Release-async" ]; then
    BUILD_TYPE=Release
    cp ../libgit2patchedfiles/src/transports/emscriptenhttp-async.c ../libgit2/src/libgit2/transports/emscriptenhttp.c

    EXTRA_CMAKE_C_FLAGS="-O3 $ASYNCIFY_FLAGS"
    POST_JS="--post-js $(pwd)/post-async.js"
    export LG2_OUTPUT_NAME=lg2_async
elif [ "$1" == "Debug-async" ]; then
    BUILD_TYPE=Debug
    cp ../libgit2patchedfiles/src/transports/emscriptenhttp-async.c ../libgit2/src/libgit2/transports/emscriptenhttp.c

    EXTRA_CMAKE_C_FLAGS="$ASYNCIFY_FLAGS"
    POST_JS="--post-js $(pwd)/post-async.js"
    export LG2_OUTPUT_NAME=lg2_async
fi

# Check if output should be bundled in a single js file
for param in "$@"; do  
  # Check if the parameter is 'abc'
  if [ "$param" == "SINGLE_FILE" ]; then
    EXTRA_CMAKE_C_FLAGS="${EXTRA_CMAKE_C_FLAGS} -s SINGLE_FILE"
    break
  fi
done

# Before building, remove any ../libgit2/src/ transports/emscriptenhttp.c left from running setup.sh 
[ -f "../libgit2/src/libgit2/transports/emscriptenhttp-async.c" ] && rm ../libgit2/src/libgit2/transports/emscriptenhttp-async.c

emcmake cmake -DCMAKE_BUILD_TYPE=$BUILD_TYPE -DCMAKE_C_FLAGS="$EXTRA_CMAKE_C_FLAGS --pre-js $(pwd)/pre.js $POST_JS -s \"EXPORTED_RUNTIME_METHODS=['FS','MEMFS','IDBFS','NODEFS','callMain']\" -sFORCE_FILESYSTEM -sEXPORT_ES6 -s INVOKE_RUN=0 -s ALLOW_MEMORY_GROWTH=1 -s STACK_SIZE=131072 -lidbfs.js -lnodefs.js -flto" -DREGEX_BACKEND=regcomp -DSONAME=OFF -DUSE_HTTPS=OFF -DBUILD_SHARED_LIBS=OFF -DTHREADSAFE=OFF -DUSE_SSH=OFF -DBUILD_CLAR=OFF -DBUILD_EXAMPLES=ON ..
emmake make lg2
