#!/bin/bash
#
# Build lg2 as a WASI 0.2 component (wasm32-wasip2) with wasi-sdk.
# No Emscripten and no JavaScript: the filesystem comes from wasi:filesystem
# and HTTP(S) from wasi:http, so it runs in any component runtime (Wasmtime, ...).
#
#   ./build.sh                 Release build of lg2
#   ./build.sh Debug           Debug build of lg2
#   ./build.sh server [Debug]  the git smart HTTP server example (server/)
#
# Output: examples/lg2.wasm, or server-build/gitserver.wasm (in this directory)
#
# Run ../setup.sh first. The pinned wasi-sdk and wit-bindgen are downloaded
# into ./tools on first use.

set -e

WASI_SDK_VERSION=34
WIT_BINDGEN_VERSION=0.62.0

BUILD_TYPE=Release
TARGET=lg2
for arg in "$@"; do
    case "$arg" in
        Debug) BUILD_TYPE=Debug ;;
        server) TARGET=server ;;
    esac
done

cd "$(dirname "$0")"
HERE=$(pwd)
TOOLS=$HERE/tools

case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)  SDK_PLATFORM=x86_64-linux;  BINDGEN_PLATFORM=x86_64-linux ;;
    Linux-aarch64) SDK_PLATFORM=arm64-linux;   BINDGEN_PLATFORM=aarch64-linux ;;
    Darwin-arm64)  SDK_PLATFORM=arm64-macos;   BINDGEN_PLATFORM=aarch64-macos ;;
    Darwin-x86_64) SDK_PLATFORM=x86_64-macos;  BINDGEN_PLATFORM=x86_64-macos ;;
    *) echo "Unsupported build platform: $(uname -s)-$(uname -m)"; exit 1 ;;
esac

WASI_SDK=$TOOLS/wasi-sdk-$WASI_SDK_VERSION.0-$SDK_PLATFORM
WIT_BINDGEN=$TOOLS/wit-bindgen-$WIT_BINDGEN_VERSION-$BINDGEN_PLATFORM/wit-bindgen

mkdir -p "$TOOLS"
if [ ! -d "$WASI_SDK" ]; then
    curl -sSL "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-$WASI_SDK_VERSION/wasi-sdk-$WASI_SDK_VERSION.0-$SDK_PLATFORM.tar.gz" | tar -xz -C "$TOOLS"
fi
if [ ! -x "$WIT_BINDGEN" ]; then
    curl -sSL "https://github.com/bytecodealliance/wit-bindgen/releases/download/v$WIT_BINDGEN_VERSION/wit-bindgen-$WIT_BINDGEN_VERSION-$BINDGEN_PLATFORM.tar.gz" | tar -xz -C "$TOOLS"
fi

# NO_MMAP: WASI has no mmap, use libgit2's read-into-memory fallback.
LIBGIT2_OPTIONS="-DCMAKE_TOOLCHAIN_FILE=$WASI_SDK/share/cmake/wasi-sdk-p2.cmake \
    -DWASI_SDK_PREFIX=$WASI_SDK \
    -DCMAKE_BUILD_TYPE=$BUILD_TYPE \
    -DREGEX_BACKEND=builtin -DUSE_HTTP_PARSER=builtin -DUSE_BUNDLED_ZLIB=ON \
    -DUSE_HTTPS=OFF -DUSE_SSH=OFF -DUSE_GSSAPI=OFF -DUSE_THREADS=OFF -DUSE_NSEC=OFF \
    -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTS=OFF -DBUILD_CLI=OFF"
# The default 64KB stack is too small for libgit2.
STACK_SIZE="-Wl,-z,stack-size=1048576"

if [ "$TARGET" == "server" ]; then
    # The server uses no outgoing HTTP, so libgit2 is built without the
    # wasi:http client transport (its bindings would clash with the server's).
    mkdir -p server-build && cd server-build
    rm -rf bindings && mkdir bindings
    "$WIT_BINDGEN" c ../wit --world git-server --out-dir bindings
    cmake ../../libgit2 $LIBGIT2_OPTIONS -DBUILD_EXAMPLES=OFF \
        -DCMAKE_C_FLAGS="-DNO_MMAP -DGIT_WASI_NO_HTTP_CLIENT"
    make -j4 libgit2package

    OPT="-O2"
    [ "$BUILD_TYPE" == "Debug" ] && OPT="-O0 -g"
    "$WASI_SDK/bin/clang" --target=wasm32-wasip2 -mexec-model=reactor $OPT -Wall \
        -I../../libgit2/include -I../../libgit2/deps/zlib -Ibindings \
        ../server/proto.c ../server/backend_fs.c \
        bindings/git_server.c bindings/git_server_component_type.o \
        libgit2.a $STACK_SIZE -o gitserver.wasm
    echo "Built $HERE/server-build/gitserver.wasm"
    exit 0
fi

# C bindings for wasi:http, used by libgit2/src/libgit2/transports/wasihttp.c.
# The generated .c is wrapped in the same guard as wasihttp.c, so Emscripten
# and server builds of the same libgit2 tree compile it to nothing.
rm -rf bindings && mkdir bindings
"$WIT_BINDGEN" c wit --world lg2-http --out-dir bindings
TRANSPORTS=../libgit2/src/libgit2/transports
{ echo "#if defined(__wasi__) && !defined(GIT_WASI_NO_HTTP_CLIENT)"; cat bindings/lg2_http.c; echo "#endif"; } > $TRANSPORTS/lg2_http.c
cp bindings/lg2_http.h $TRANSPORTS/lg2_http.h

cmake ../libgit2 $LIBGIT2_OPTIONS -DBUILD_EXAMPLES=ON \
    -DCMAKE_C_FLAGS="-DNO_MMAP" \
    -DCMAKE_EXE_LINKER_FLAGS="$STACK_SIZE $HERE/bindings/lg2_http_component_type.o"
make -j4 lg2

# wasi-sdk's toolchain file doesn't apply its .wasm suffix to the examples
mv -f examples/lg2 examples/lg2.wasm 2>/dev/null || true
echo "Built $HERE/examples/lg2.wasm"
