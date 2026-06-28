/**
 * post-opfs.js — extra glue for the SAB-free OPFS builds (lg2_opfs_async /
 * lg2_opfs_jspi). Appended AFTER post.js (which provides the synchronous HTTP
 * transport used inside the Web Worker).
 *
 * Because the OPFS filesystem calls suspend the wasm stack (ASYNCIFY or JSPI),
 * `callMain` no longer completes synchronously: with JSPI the entry point is a
 * "promising" function that returns a Promise, and with ASYNCIFY the call
 * returns while an async continuation is still pending. We wrap `callMain` so
 * callers can simply `await lg.callMain([...])` regardless of which mechanism
 * the build uses.
 */

// libgit2 sometimes calls chmod with only S_IFREG set (mode 0). Make chmod a
// no-op (same workaround the async transport build uses) so those calls don't
// fail; file permission bits are irrelevant in the browser FS anyway.
const _opfs_origChmod = FS.chmod;
FS.chmod = function (path, mode, dontFollow) {
  try {
    return _opfs_origChmod.call(FS, path, mode, dontFollow);
  } catch (e) {
    return 0;
  }
};

Module.origCallMain = Module.callMain;
Module.callMain = async (args) => {
  // JSPI: origCallMain returns a Promise (entry point is WebAssembly.promising).
  // ASYNCIFY: origCallMain returns synchronously but may leave a pending chain.
  const ret = await Module.origCallMain(args);
  if (typeof Asyncify === 'object' && Asyncify.whenDone && Asyncify.currData) {
    await Asyncify.whenDone();
  }
  return ret;
};
