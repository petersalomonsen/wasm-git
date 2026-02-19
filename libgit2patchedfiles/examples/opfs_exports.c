/*
 * Force export of WASMFS OPFS functions for use from JavaScript.
 * These functions would otherwise be eliminated by dead code elimination.
 */
#ifdef __EMSCRIPTEN__
#include <emscripten/wasmfs.h>
#include <emscripten.h>

EMSCRIPTEN_KEEPALIVE
backend_t lg2_create_opfs_backend(void) {
    return wasmfs_create_opfs_backend();
}

EMSCRIPTEN_KEEPALIVE
int lg2_create_directory(const char* path, int mode, backend_t backend) {
    return wasmfs_create_directory(path, mode, backend);
}
#endif
