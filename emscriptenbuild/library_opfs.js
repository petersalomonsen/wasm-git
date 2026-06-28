/**
 * library_opfs.js — SAB-free OPFS persistence for wasm-git.
 *
 * This Emscripten `--js-library` makes a sub-tree of the in-memory (MEMFS)
 * filesystem persist to the browser's Origin Private File System (OPFS),
 * WITHOUT requiring SharedArrayBuffer / cross-origin isolation.
 *
 * The standard OPFS build (`lg2_opfs`, WasmFS + pthreads) blocks a worker on
 * the async OPFS API via `Atomics.wait`, which forces SharedArrayBuffer and
 * therefore COOP/COEP cross-origin isolation. Here we instead suspend the wasm
 * stack across the async OPFS calls using either ASYNCIFY or JSPI (the build
 * flag decides which; `Asyncify.handleAsync` works under both). No threads, no
 * SharedArrayBuffer.
 *
 * Model
 * -----
 * - MEMFS is mounted at `OPFS_ROOT` (`/opfs`) and acts as a working cache.
 * - libgit2's POSIX file IO goes through the libc syscalls. We override the
 *   four *mutating* path syscalls plus `fd_close` so that changes under
 *   `/opfs` are mirrored to OPFS:
 *       __syscall_mkdirat   → create OPFS directory
 *       __syscall_unlinkat  → remove OPFS entry (file or dir)
 *       __syscall_renameat  → OPFS has no rename: copy + delete
 *       fd_close            → flush a written file's bytes to OPFS
 *   Reads, stats and directory listings are served from the MEMFS cache, so
 *   they stay fully synchronous and fast.
 * - Each override is a *thin* wrapper: `return Asyncify.handleAsync(async ...)`.
 *   All side-effectful JS (the matching `FS.*` call) runs INSIDE the once-only
 *   async callback, so the asyncify unwind/rewind never double-executes it.
 * - On startup (or after a reload) the consumer loads an existing repo's tree
 *   from OPFS into the MEMFS cache via `Module.opfsLoadTree(path)` (plain async
 *   JS — no wasm involved), after which everything is present for libgit2.
 *
 * Exposed on the Module instance (all async, OPFS-aware):
 *   opfsLoadTree(path)            populate MEMFS cache from OPFS, returns bool
 *   opfsRemoveTree(path)          delete a sub-tree from both MEMFS and OPFS
 *   opfsExists(path)              does the path exist in OPFS?
 *   opfsReadFile(path, enc?)      read a file straight from OPFS
 *   opfsWriteFile(path, data)     write to OPFS *and* the MEMFS cache
 *   opfsRoot                      the MEMFS mount point ('/opfs')
 */

addToLibrary({
  $OPFS__deps: ['$FS', '$stringToUTF8', '$lengthBytesUTF8'],
  $OPFS__postset: 'addOnPreRun(() => OPFS.init());',
  $OPFS: {
    root: '/opfs', // MEMFS mount point that mirrors the OPFS root directory

    // ---- path helpers -----------------------------------------------------
    isOpfsPath(p) {
      return p === OPFS.root || p.startsWith(OPFS.root + '/');
    },
    // '/opfs/a/b' -> ['a','b']   (relative to the OPFS root directory)
    toParts(p) {
      var rel = p.slice(OPFS.root.length);
      return rel.split('/').filter((s) => s.length > 0);
    },

    // ---- low level OPFS handle resolution (async) --------------------------
    async dirHandle(parts, create) {
      var dir = await navigator.storage.getDirectory();
      for (var i = 0; i < parts.length; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: !!create });
      }
      return dir;
    },
    async fileHandle(parts, create) {
      var parent = await OPFS.dirHandle(parts.slice(0, -1), create);
      return await parent.getFileHandle(parts[parts.length - 1], { create: !!create });
    },

    // ---- primitive OPFS operations (async) --------------------------------
    async writeBytes(parts, bytes) {
      var fh = await OPFS.fileHandle(parts, true);
      var ah = await fh.createSyncAccessHandle();
      try {
        ah.truncate(0);
        ah.write(bytes, { at: 0 });
        ah.flush();
      } finally {
        ah.close();
      }
    },
    async readBytes(parts) {
      var fh = await OPFS.fileHandle(parts, false);
      var file = await fh.getFile();
      return new Uint8Array(await file.arrayBuffer());
    },
    async mkdir(parts) {
      await OPFS.dirHandle(parts, true);
    },
    async remove(parts) {
      if (parts.length === 0) return; // never remove the root itself
      var parent = await OPFS.dirHandle(parts.slice(0, -1), false);
      try {
        await parent.removeEntry(parts[parts.length - 1], { recursive: true });
      } catch (e) {
        /* already gone */
      }
    },
    async list(parts) {
      var dir = await OPFS.dirHandle(parts, false);
      var entries = [];
      for await (var [name, handle] of dir.entries()) {
        entries.push({ name, kind: handle.kind });
      }
      return entries;
    },
    async exists(parts) {
      if (parts.length === 0) return true;
      try {
        var parent = await OPFS.dirHandle(parts.slice(0, -1), false);
        var name = parts[parts.length - 1];
        for await (var [n] of parent.entries()) {
          if (n === name) return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    },

    // ---- MEMFS helpers ----------------------------------------------------
    // Ensure all MEMFS directories along `path` exist (path is absolute).
    ensureMemDir(path) {
      var parts = path.split('/').filter((s) => s.length > 0);
      var cur = '';
      for (var i = 0; i < parts.length; i++) {
        cur += '/' + parts[i];
        try {
          FS.mkdir(cur);
        } catch (e) {
          /* EEXIST */
        }
      }
    },
    // Current bytes of a MEMFS file (sync).
    memBytes(path) {
      return FS.readFile(path); // Uint8Array
    },

    // ---- recursive load: OPFS -> MEMFS cache (async) ----------------------
    async loadTree(memPath) {
      var parts = OPFS.toParts(memPath);
      // verify the top directory exists in OPFS
      try {
        await OPFS.dirHandle(parts, false);
      } catch (e) {
        return false; // not present in OPFS
      }
      OPFS.ensureMemDir(memPath);
      var stack = [memPath];
      while (stack.length) {
        var d = stack.pop();
        var entries = await OPFS.list(OPFS.toParts(d));
        for (var i = 0; i < entries.length; i++) {
          var child = d + '/' + entries[i].name;
          if (entries[i].kind === 'directory') {
            try { FS.mkdir(child); } catch (e) { /* EEXIST */ }
            stack.push(child);
          } else {
            var bytes = await OPFS.readBytes(OPFS.toParts(child));
            try { FS.unlink(child); } catch (e) {}
            FS.writeFile(child, bytes);
          }
        }
      }
      return true;
    },

    // ---- recursive write: MEMFS -> OPFS (async) ---------------------------
    // Used by rename (OPFS lacks a native rename, so we copy then delete).
    async writeTree(memPath) {
      var parts = OPFS.toParts(memPath);
      var mode = FS.stat(memPath).mode;
      if (FS.isDir(mode)) {
        await OPFS.mkdir(parts);
        var names = FS.readdir(memPath).filter((n) => n !== '.' && n !== '..');
        for (var i = 0; i < names.length; i++) {
          await OPFS.writeTree(memPath + '/' + names[i]);
        }
      } else {
        await OPFS.writeBytes(parts, OPFS.memBytes(memPath));
      }
    },

    // ---- recursive remove: MEMFS + OPFS (async) ---------------------------
    async removeTree(memPath) {
      // MEMFS side
      try {
        var st = FS.stat(memPath);
        if (FS.isDir(st.mode)) {
          var names = FS.readdir(memPath).filter((n) => n !== '.' && n !== '..');
          for (var i = 0; i < names.length; i++) {
            await OPFS.removeTree(memPath + '/' + names[i]);
          }
          FS.rmdir(memPath);
        } else {
          FS.unlink(memPath);
        }
      } catch (e) {
        /* not in MEMFS */
      }
      // OPFS side
      await OPFS.remove(OPFS.toParts(memPath));
    },

    // ---- expose the public async API on the Module instance ---------------
    init() {
      OPFS.ensureMemDir(OPFS.root);

      Module['opfsRoot'] = OPFS.root;

      Module['opfsLoadTree'] = (path) => OPFS.loadTree(path);

      Module['opfsRemoveTree'] = (path) => OPFS.removeTree(path);

      Module['opfsExists'] = (path) =>
        OPFS.isOpfsPath(path) ? OPFS.exists(OPFS.toParts(path)) : Promise.resolve(FS.analyzePath(path).exists);

      Module['opfsReadFile'] = async (path, enc) => {
        var bytes = await OPFS.readBytes(OPFS.toParts(path));
        return enc === 'utf8' ? new TextDecoder().decode(bytes) : bytes;
      };

      Module['opfsWriteFile'] = async (path, data) => {
        var bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        OPFS.ensureMemDir(path.slice(0, path.lastIndexOf('/')));
        try { FS.unlink(path); } catch (e) {}
        FS.writeFile(path, bytes);
        await OPFS.writeBytes(OPFS.toParts(path), bytes);
      };
    },
  },

  // =========================================================================
  // Syscall overrides. Each is a thin wrapper so that the asyncify/JSPI
  // suspend happens at the import boundary with no non-idempotent JS above it.
  // The built-in syscall wrapper (SYSCALLS.varargs setup + errno try/catch) is
  // NOT applied to user-library overrides, so we replicate it by hand.
  // =========================================================================

  __syscall_mkdirat__deps: ['$OPFS', '$FS', '$SYSCALLS'],
  __syscall_mkdirat__async: true,
  __syscall_mkdirat: function (dirfd, path, mode) {
    var p = SYSCALLS.calculateAt(dirfd, SYSCALLS.getStr(path));
    if (!OPFS.isOpfsPath(p)) {
      try { FS.mkdir(p, mode, 0); return 0; }
      catch (e) { if (e.name !== 'ErrnoError') throw e; return -e.errno; }
    }
    return Asyncify.handleAsync(async () => {
      try {
        FS.mkdir(p, mode, 0);
        await OPFS.mkdir(OPFS.toParts(p));
        return 0;
      } catch (e) {
        if (e.name !== 'ErrnoError') throw e;
        return -e.errno;
      }
    });
  },

  __syscall_unlinkat__deps: ['$OPFS', '$FS', '$SYSCALLS'],
  __syscall_unlinkat__async: true,
  __syscall_unlinkat: function (dirfd, path, flags) {
    var p = SYSCALLS.calculateAt(dirfd, SYSCALLS.getStr(path));
    var rmdir = flags === {{{ cDefs.AT_REMOVEDIR }}};
    if (!rmdir && flags) return -{{{ cDefs.EINVAL }}};
    if (!OPFS.isOpfsPath(p)) {
      try { rmdir ? FS.rmdir(p) : FS.unlink(p); return 0; }
      catch (e) { if (e.name !== 'ErrnoError') throw e; return -e.errno; }
    }
    return Asyncify.handleAsync(async () => {
      try {
        rmdir ? FS.rmdir(p) : FS.unlink(p);
        await OPFS.remove(OPFS.toParts(p));
        return 0;
      } catch (e) {
        if (e.name !== 'ErrnoError') throw e;
        return -e.errno;
      }
    });
  },

  __syscall_renameat__deps: ['$OPFS', '$FS', '$SYSCALLS'],
  __syscall_renameat__async: true,
  __syscall_renameat: function (olddirfd, oldpath, newdirfd, newpath) {
    var oldp = SYSCALLS.calculateAt(olddirfd, SYSCALLS.getStr(oldpath));
    var newp = SYSCALLS.calculateAt(newdirfd, SYSCALLS.getStr(newpath));
    var oldOpfs = OPFS.isOpfsPath(oldp);
    var newOpfs = OPFS.isOpfsPath(newp);
    if (!oldOpfs && !newOpfs) {
      try { FS.rename(oldp, newp); return 0; }
      catch (e) { if (e.name !== 'ErrnoError') throw e; return -e.errno; }
    }
    return Asyncify.handleAsync(async () => {
      try {
        FS.rename(oldp, newp);
        // OPFS has no rename: write the (moved) sub-tree to its new location
        // and remove the old one.
        if (newOpfs) await OPFS.writeTree(newp);
        if (oldOpfs) await OPFS.remove(OPFS.toParts(oldp));
        return 0;
      } catch (e) {
        if (e.name !== 'ErrnoError') throw e;
        return -e.errno;
      }
    });
  },

  // fd_close: flush a written OPFS file to disk, then close the stream.
  //
  // IMPORTANT: the synchronous part of an asyncify/JSPI import runs again on
  // *rewind*. Resolving the fd to a stream here would break, because by rewind
  // the callback has already closed it (getStreamFromFD would throw, changing
  // the control flow and corrupting the unwind/rewind). So we keep the prologue
  // empty/idempotent and do ALL stream work inside the once-only callback.
  fd_close__deps: ['$OPFS', '$FS', '$SYSCALLS'],
  fd_close__async: true,
  fd_close: function (fd) {
    return Asyncify.handleAsync(async () => {
      try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        var path = stream.path;
        var writable = (stream.flags & {{{ cDefs.O_ACCMODE }}}) !== {{{ cDefs.O_RDONLY }}};
        var persist = writable && OPFS.isOpfsPath(path) && FS.isFile(stream.node.mode);
        var bytes = persist ? OPFS.memBytes(path) : null;
        FS.close(stream);
        if (persist) await OPFS.writeBytes(OPFS.toParts(path), bytes);
        return 0;
      } catch (e) {
        if (e.name !== 'ErrnoError') throw e;
        return -e.errno;
      }
    });
  },
});
