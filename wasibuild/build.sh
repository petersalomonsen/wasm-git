#!/bin/bash
#
# Build lg2 as a WASI 0.2 component (wasm32-wasip2) with wasi-sdk.
# No Emscripten and no JavaScript: the filesystem comes from wasi:filesystem
# and HTTP(S) from wasi:http, so it runs in any component runtime (Wasmtime, ...).
#
#   ./build.sh            Release build
#   ./build.sh Debug      Debug build
#
# Output: examples/lg2.wasm (in this directory)
#
# Run ../setup.sh first. The pinned wasi-sdk and wit-bindgen are downloaded
# into ./tools on first use.

set -e

WASI_SDK_VERSION=34
WIT_BINDGEN_VERSION=0.62.0

BUILD_TYPE=Release
if [ "$1" == "Debug" ]; then
    BUILD_TYPE=Debug
fi

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

# C bindings for wasi:http, used by libgit2/src/libgit2/transports/wasihttp.c.
# The generated .c is wrapped in __wasi__ so Emscripten builds of the same
# libgit2 tree compile it to nothing.
rm -rf bindings && mkdir bindings
"$WIT_BINDGEN" c wit --world lg2-http --out-dir bindings
TRANSPORTS=../libgit2/src/libgit2/transports
{ echo "#ifdef __wasi__"; cat bindings/lg2_http.c; echo "#endif"; } > $TRANSPORTS/lg2_http.c
cp bindings/lg2_http.h $TRANSPORTS/lg2_http.h

# NO_MMAP: WASI has no mmap, use libgit2's read-into-memory fallback.
# The default 64KB stack is too small for libgit2.
cmake ../libgit2 \
    -DCMAKE_TOOLCHAIN_FILE="$WASI_SDK/share/cmake/wasi-sdk-p2.cmake" \
    -DWASI_SDK_PREFIX="$WASI_SDK" \
    -DCMAKE_BUILD_TYPE=$BUILD_TYPE \
    -DCMAKE_C_FLAGS="-DNO_MMAP" \
    -DCMAKE_EXE_LINKER_FLAGS="-Wl,-z,stack-size=1048576 $HERE/bindings/lg2_http_component_type.o" \
    -DREGEX_BACKEND=builtin -DUSE_HTTP_PARSER=builtin -DUSE_BUNDLED_ZLIB=ON \
    -DUSE_HTTPS=OFF -DUSE_SSH=OFF -DUSE_GSSAPI=OFF -DUSE_THREADS=OFF -DUSE_NSEC=OFF \
    -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTS=OFF -DBUILD_CLI=OFF -DBUILD_EXAMPLES=ON
make -j4 lg2

# wasi-sdk's toolchain file doesn't apply its .wasm suffix to the examples
mv -f examples/lg2 examples/lg2.wasm 2>/dev/null || true
echo "Built $HERE/examples/lg2.wasm"
