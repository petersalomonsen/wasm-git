#!/bin/bash
BUILD_TYPE=Debug

# Set build type to Release for release
if [ "$1" == "Release" ]; then
    BUILD_TYPE=Release
    EXTRA_CMAKE_C_FLAGS="-Oz"
fi

cmake -D CMAKE_C_COMPILER=clang -DCMAKE_BUILD_TYPE=$BUILD_TYPE -DCMAKE_C_FLAGS="--target=wasm32-wasi --sysroot=wasi-sdk-20.0/share/wasi-sysroot $EXTRA_CMAKE_C_FLAGS" -DREGEX_BACKEND=regcomp -DSONAME=OFF -DUSE_HTTPS=OpenSSL -DBUILD_SHARED_LIBS=OFF -DTHREADSAFE=OFF -DUSE_SSH=OFF -DBUILD_CLAR=OFF -DBUILD_EXAMPLES=ON ../libgit2
make lg2 VERBOSE=1


 cd /workspaces/wasm-git/wasibuild/src/util && /usr/bin/clang -DOPENSSL_API_COMPAT=0x10100000L -DSHA1DC_CUSTOM_INCLUDE_SHA1_C=\"git2_util.h\" -DSHA1DC_CUSTOM_INCLUDE_UBC_CHECK_C=\"git2_util.h\" -DSHA1DC_NO_STANDARD_INCLUDES=1 -I/workspaces/wasm-git/wasibuild/src/util -I/workspaces/wasm-git/wasibuild/include -I/workspaces/wasm-git/libgit2/src/util -I/workspaces/wasm-git/libgit2/include -I/workspaces/wasm-git/libgit2/deps/http-parser -I/workspaces/wasm-git/libgit2/deps/xdiff -I/workspaces/wasm-git/libgit2/deps/ntlmclient  -D_GNU_SOURCE -Wall -Wextra -Wdocumentation -Wno-documentation-deprecated-sync -Wno-missing-field-initializers -Wmissing-declarations -Wstrict-aliasing -Wstrict-prototypes -Wdeclaration-after-statement -Wshift-count-overflow -Wunused-const-variable -Wunused-function -Wint-conversion -Wc11-extensions -Wformat -Wformat-security -g -D_DEBUG -O0   -std=gnu90 -o CMakeFiles/util.dir/alloc.c.o   -c /workspaces/wasm-git/libgit2/src/util/alloc.c