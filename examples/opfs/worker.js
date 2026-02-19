/**
 * wasm-git OPFS Web Worker example.
 *
 * Runs git operations synchronously inside a Worker using the OPFS
 * (Origin Private File System) backend for persistent storage.
 *
 * Requires Cross-Origin-Opener-Policy: same-origin and
 * Cross-Origin-Embedder-Policy: credentialless headers on the page.
 *
 * Message API:
 *   clone            { url }                 → { dircontents }
 *   writecommitandpush { filename, contents } → { dircontents }
 *   deletelocal      {}                      → { deleted }
 *   readfile         { filename }            → { filename, filecontents }
 *   synclocal        { url }                 → { dircontents } | { notfound: true }
 */

let stdout = [];
let stderr = [];

globalThis.wasmGitModuleOverrides = {
    print:    (text) => { console.log(text);   stdout.push(text); },
    printErr: (text) => { console.error(text); stderr.push(text); },
};

const lg2mod = await import(new URL('lg2_opfs.js', import.meta.url));
const lg = await lg2mod.default();

const FS = lg.FS;

// WASMFS doesn't pre-create /home/web_user like MEMFS does
try { FS.mkdir('/home'); } catch (e) {}
try { FS.mkdir('/home/web_user'); } catch (e) {}
FS.writeFile('/home/web_user/.gitconfig',
    `[user]
name = wasm-git Demo
email = demo@example.com`);

// Set up the OPFS-backed working directory
const backend = lg._lg2_create_opfs_backend();
if (!backend) {
    throw new Error('Failed to create OPFS backend');
}
const workingDir = '/opfs';
const mkdirResult = lg.ccall(
    'lg2_create_directory', 'number',
    ['string', 'number', 'number'],
    [workingDir, 0o777, backend]
);
if (mkdirResult !== 0) {
    throw new Error('Failed to create OPFS directory, error: ' + mkdirResult);
}
FS.chdir(workingDir);

// Current working repo directory (absolute path, e.g. '/opfs/testrepo.git')
let currentRepoDir;

function rmdirRecursive(p) {
    for (const entry of FS.readdir(p).filter(e => e !== '.' && e !== '..')) {
        const full = p + '/' + entry;
        try {
            // FS.readdir throws ENOTDIR for files; use it to detect directories
            FS.readdir(full);
            rmdirRecursive(full);
        } catch (e) {
            FS.unlink(full);
        }
    }
    FS.rmdir(p);
}

// ---------------------------------------------------------------------------
// WASMFS getcwd() workaround
//
// WASMFS has a bug where getcwd() drops the mount-point name for directories
// backed by a different backend (e.g. OPFS mounted under the MemoryBackend
// root). It returns '//repo' instead of '/opfs/repo', which breaks libgit2's
// repository discovery. Creating a symlink at the root means the broken path
// still resolves to the correct OPFS-backed directory.
// ---------------------------------------------------------------------------
function createMountPointSymlink(repoName) {
    try { FS.unlink('/' + repoName); } catch (e) {}
    FS.symlink(workingDir + '/' + repoName, '/' + repoName);
}

function removeMountPointSymlink(repoName) {
    try { FS.unlink('/' + repoName); } catch (e) {}
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
// The message handler is async so we can await native OPFS cleanup before
// synchronous callMain operations (messages are always sent one at a time).
onmessage = async (msg) => {
    stdout = [];
    stderr = [];

    const { command } = msg.data;

    if (command === 'clone') {
        const repoName = msg.data.url.substring(msg.data.url.lastIndexOf('/') + 1);
        currentRepoDir = workingDir + '/' + repoName;
        // Clean up both WASMFS in-memory tree and native OPFS before cloning.
        // Both layers must be cleared: rmdirRecursive clears the WASMFS tree,
        // and removeEntry clears the underlying OPFS storage.
        try { rmdirRecursive(currentRepoDir); } catch (e) {}
        try {
            const opfsRoot = await navigator.storage.getDirectory();
            await opfsRoot.removeEntry(repoName, { recursive: true });
        } catch (e) { /* directory did not exist */ }
        // Use absolute path to avoid CWD ambiguity
        lg.callMain(['clone', msg.data.url, currentRepoDir]);
        createMountPointSymlink(repoName);
        FS.chdir(currentRepoDir);
        postMessage({ dircontents: FS.readdir('.') });

    } else if (command === 'writecommitandpush') {
        FS.chdir(currentRepoDir);
        FS.writeFile(msg.data.filename, msg.data.contents);
        FS.chdir(currentRepoDir);
        lg.callMain(['add', '--verbose', msg.data.filename]);
        FS.chdir(currentRepoDir);
        lg.callMain(['commit', '-m', `add ${msg.data.filename}`]);
        FS.chdir(currentRepoDir);
        lg.callMain(['push']);
        FS.chdir(currentRepoDir);
        postMessage({ dircontents: FS.readdir('.') });

    } else if (command === 'deletelocal') {
        const repoName = currentRepoDir ? currentRepoDir.split('/').pop() : null;
        try {
            FS.chdir(workingDir);
            if (currentRepoDir) rmdirRecursive(currentRepoDir);
        } catch (e) {
            console.warn('deletelocal WASMFS error:', e);
        }
        // Also remove from native OPFS so the deletion is fully persisted.
        // WASMFS may not propagate all deletions to the underlying OPFS storage.
        if (repoName) {
            try {
                const opfsRoot = await navigator.storage.getDirectory();
                await opfsRoot.removeEntry(repoName, { recursive: true });
            } catch (e) { /* already gone */ }
            removeMountPointSymlink(repoName);
        }
        currentRepoDir = undefined;
        postMessage({ deleted: repoName });

    } else if (command === 'readfile') {
        try {
            postMessage({
                filename: msg.data.filename,
                filecontents: FS.readFile(msg.data.filename, { encoding: 'utf8' }),
            });
        } catch (e) {
            postMessage({ stderr: String(e) });
        }

    } else if (command === 'synclocal') {
        const repoName = msg.data.url.substring(msg.data.url.lastIndexOf('/') + 1);
        currentRepoDir = workingDir + '/' + repoName;
        try {
            const contents = FS.readdir(currentRepoDir);
            if (contents.find(f => f === '.git')) {
                createMountPointSymlink(repoName);
                FS.chdir(currentRepoDir);
                postMessage({ dircontents: contents });
            } else {
                postMessage({ notfound: true });
            }
        } catch (e) {
            postMessage({ notfound: true });
        }
    }
};

postMessage({ ready: true });
