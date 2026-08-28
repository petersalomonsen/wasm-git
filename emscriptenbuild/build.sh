#!/bin/bash

BUILD_TYPE=Debug
ASYNCIFY_FLAGS=" -s ASYNCIFY -s 'ASYNCIFY_IMPORTS=[\"emscriptenhttp_do_get\", \"emscriptenhttp_do_read\", \"emscriptenhttp_do_post\"]' "
POST_JS="--post-js $(pwd)/post.js"
FS_LIBRARIES="-lidbfs.js -lnodefs.js"
FS_EXPORTS="'FS','MEMFS','IDBFS','NODEFS','callMain','HEAPU8'"
EXTRA_CMAKE_DEFINES=""
# Link-only flags (e.g. --js-library, which clang rejects during compilation).
EXTRA_LINK_FLAGS=""

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
# For OPFS builds with WASMFS (runs in a Web Worker, no Asyncify needed)
elif [ "$1" == "Release-opfs" ]; then
    BUILD_TYPE=Release
    # Use sync transport (runs in Web Worker) - don't override with async transport
    EXTRA_CMAKE_C_FLAGS="-O3 -pthread -sWASMFS -sWASM_BIGINT -sPTHREAD_POOL_SIZE=1"
    POST_JS="--post-js $(pwd)/post.js"
    export LG2_OUTPUT_NAME=lg2_opfs
    # WASMFS doesn't use the old FS libraries
    FS_LIBRARIES=""
    FS_EXPORTS="'FS','callMain','HEAPU8','ccall'"
    EXTRA_CMAKE_DEFINES="-DUSE_THREADS=OFF -DUSE_NSEC=OFF"
    # Copy OPFS exports helper to examples for WASMFS builds
    cp ../libgit2patchedfiles/examples/opfs_exports.c ../libgit2/examples/opfs_exports.c
elif [ "$1" == "Debug-opfs" ]; then
    BUILD_TYPE=Debug
    # Use sync transport (runs in Web Worker) - don't override with async transport
    EXTRA_CMAKE_C_FLAGS="-pthread -sWASMFS -sWASM_BIGINT -sPTHREAD_POOL_SIZE=1"
    POST_JS="--post-js $(pwd)/post.js"
    export LG2_OUTPUT_NAME=lg2_opfs
    # WASMFS doesn't use the old FS libraries
    FS_LIBRARIES=""
    FS_EXPORTS="'FS','callMain','HEAPU8','ccall'"
    EXTRA_CMAKE_DEFINES="-DUSE_THREADS=OFF -DUSE_NSEC=OFF"
    # Copy OPFS exports helper to examples for WASMFS builds
    cp ../libgit2patchedfiles/examples/opfs_exports.c ../libgit2/examples/opfs_exports.c
# SAB-free OPFS builds: persist to OPFS by suspending the wasm stack across the
# async OPFS calls (no pthreads, no SharedArrayBuffer). The persistence layer
# lives in the --js-library library_opfs.js. HTTP uses the sync transport (runs
# in a Web Worker); only the OPFS filesystem calls are suspended.
elif [ "$1" == "Release-opfs-async" ]; then
    BUILD_TYPE=Release
    EXTRA_CMAKE_C_FLAGS="-O3 -sASYNCIFY -sASYNCIFY_STACK_SIZE=1048576"
    POST_JS="--post-js $(pwd)/post.js --post-js $(pwd)/post-opfs.js"
    EXTRA_LINK_FLAGS="--js-library $(pwd)/library_opfs.js"
    export LG2_OUTPUT_NAME=lg2_opfs_async
    FS_LIBRARIES=""
    FS_EXPORTS="'FS','callMain','HEAPU8','ccall'"
    EXTRA_CMAKE_DEFINES="-DUSE_THREADS=OFF -DUSE_NSEC=OFF"
elif [ "$1" == "Debug-opfs-async" ]; then
    BUILD_TYPE=Debug
    EXTRA_CMAKE_C_FLAGS="-sASYNCIFY -sASYNCIFY_STACK_SIZE=1048576"
    POST_JS="--post-js $(pwd)/post.js --post-js $(pwd)/post-opfs.js"
    EXTRA_LINK_FLAGS="--js-library $(pwd)/library_opfs.js"
    export LG2_OUTPUT_NAME=lg2_opfs_async
    FS_LIBRARIES=""
    FS_EXPORTS="'FS','callMain','HEAPU8','ccall'"
    EXTRA_CMAKE_DEFINES="-DUSE_THREADS=OFF -DUSE_NSEC=OFF"
elif [ "$1" == "Release-opfs-jspi" ]; then
    BUILD_TYPE=Release
    EXTRA_CMAKE_C_FLAGS="-O3 -sJSPI"
    POST_JS="--post-js $(pwd)/post.js --post-js $(pwd)/post-opfs.js"
    EXTRA_LINK_FLAGS="--js-library $(pwd)/library_opfs.js"
    export LG2_OUTPUT_NAME=lg2_opfs_jspi
    FS_LIBRARIES=""
    FS_EXPORTS="'FS','callMain','HEAPU8','ccall'"
    EXTRA_CMAKE_DEFINES="-DUSE_THREADS=OFF -DUSE_NSEC=OFF"
elif [ "$1" == "Debug-opfs-jspi" ]; then
    BUILD_TYPE=Debug
    EXTRA_CMAKE_C_FLAGS="-sJSPI"
    POST_JS="--post-js $(pwd)/post.js --post-js $(pwd)/post-opfs.js"
    EXTRA_LINK_FLAGS="--js-library $(pwd)/library_opfs.js"
    export LG2_OUTPUT_NAME=lg2_opfs_jspi
    FS_LIBRARIES=""
    FS_EXPORTS="'FS','callMain','HEAPU8','ccall'"
    EXTRA_CMAKE_DEFINES="-DUSE_THREADS=OFF -DUSE_NSEC=OFF"
elif [ "$1" == "Release-workerfs" ]; then
    BUILD_TYPE=Release
    EXTRA_CMAKE_C_FLAGS="-Oz"
    FS_LIBRARIES="-lworkerfs.js -lmemfs.js"
    FS_EXPORTS="'FS','MEMFS','WORKERFS','callMain','HEAPU8'"
    export LG2_OUTPUT_NAME=lg2_workerfs
elif [ "$1" == "Debug-workerfs" ]; then
    BUILD_TYPE=Debug
    FS_LIBRARIES="-lworkerfs.js -lmemfs.js"
    FS_EXPORTS="'FS','MEMFS','WORKERFS','callMain','HEAPU8'"
    export LG2_OUTPUT_NAME=lg2_workerfs
fi

# Before building, remove any ../libgit2/src/ transports/emscriptenhttp.c left from running setup.sh
[ -f "../libgit2/src/libgit2/transports/emscriptenhttp-async.c" ] && rm ../libgit2/src/libgit2/transports/emscriptenhttp-async.c
# The WASMFS OPFS exports (opfs_exports.c) only link against the WASMFS/pthreads
# build. Keep it ONLY for the Release-opfs / Debug-opfs variants; remove it for
# every other build (including the SAB-free OPFS variants) to avoid link errors.
if [ "$1" != "Release-opfs" ] && [ "$1" != "Debug-opfs" ]; then
    [ -f "../libgit2/examples/opfs_exports.c" ] && rm ../libgit2/examples/opfs_exports.c
fi

emcmake cmake -DCMAKE_BUILD_TYPE=$BUILD_TYPE -DCMAKE_C_FLAGS="$EXTRA_CMAKE_C_FLAGS --pre-js $(pwd)/pre.js $POST_JS -s \"EXPORTED_RUNTIME_METHODS=[$FS_EXPORTS]\" -sFORCE_FILESYSTEM -sEXPORT_ES6 -s INVOKE_RUN=0 -s ALLOW_MEMORY_GROWTH=1 -s STACK_SIZE=131072 $FS_LIBRARIES" -DCMAKE_EXE_LINKER_FLAGS="$EXTRA_LINK_FLAGS" -DREGEX_BACKEND=regcomp -DSONAME=OFF -DUSE_HTTPS=OFF -DBUILD_SHARED_LIBS=OFF -DTHREADSAFE=OFF -DUSE_SSH=OFF -DBUILD_CLAR=OFF -DBUILD_EXAMPLES=ON $EXTRA_CMAKE_DEFINES ..
emmake make lg2
