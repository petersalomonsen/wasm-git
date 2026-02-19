let stdout = [];
let stderr = [];

globalThis.wasmGitModuleOverrides = {
  'print': (text) => {
    console.log(text);
    stdout.push(text)
  },
  'printErr': (text) => {
    console.error(text);
    stderr.push(text);
  }
};

const lg2mod = await import(new URL('lg2_opfs.js', import.meta.url));
const lg = await lg2mod.default();

const FS = lg.FS;

const username = 'Test User';
const useremail = 'test@example.com';

// WASMFS doesn't pre-create /home/web_user like MEMFS does
try { FS.mkdir('/home'); } catch(e) {}
try { FS.mkdir('/home/web_user'); } catch(e) {}
FS.writeFile('/home/web_user/.gitconfig',
  `[user]
name = ${username}
email = ${useremail}`);

// Set up OPFS-backed working directory
const backend = lg._lg2_create_opfs_backend();
if (!backend) {
    throw new Error('Failed to create OPFS backend');
}
const workingDir = '/opfs';
// Use ccall to properly marshal the JS string to a C const char* pointer
const mkdirResult = lg.ccall('lg2_create_directory', 'number', ['string', 'number', 'number'], [workingDir, 0o777, backend]);
if (mkdirResult !== 0) {
    throw new Error('Failed to create OPFS directory, error: ' + mkdirResult);
}
FS.chdir(workingDir);

let currentRepoDir; // absolute path to the current repo, e.g. '/opfs/testrepo.git'

function rmdirRecursive(path) {
  const entries = FS.readdir(path).filter(e => e !== '.' && e !== '..');
  for (const entry of entries) {
    const fullPath = path + '/' + entry;
    try {
      // FS.readdir throws ENOTDIR for non-directories; use it to detect dirs
      FS.readdir(fullPath);
      rmdirRecursive(fullPath);
    } catch (e) {
      FS.unlink(fullPath);
    }
  }
  FS.rmdir(path);
}

// WASMFS has a bug where getcwd() drops mount-point names for directories
// backed by a different backend (e.g. OPFS mounted under MemoryBackend root).
// getcwd() returns '//repo' instead of '/opfs/repo', which breaks libgit2's
// repository discovery. Work around this by creating a symlink at the root
// so the broken path still resolves to the correct OPFS-backed directory.
function createMountPointSymlink(repoName) {
  try { FS.unlink('/' + repoName); } catch(e) {}
  FS.symlink(workingDir + '/' + repoName, '/' + repoName);
}

function removeMountPointSymlink(repoName) {
  try { FS.unlink('/' + repoName); } catch(e) {}
}

onmessage = (msg) => {
  stderr = [];
  stdout = [];
  if (msg.data.command === 'writecommitandpush') {
    FS.chdir(currentRepoDir);
    FS.writeFile(msg.data.filename, msg.data.contents);
    FS.chdir(currentRepoDir);
    lg.callMain(['add', '--verbose', msg.data.filename]);
    FS.chdir(currentRepoDir);
    lg.callMain(['commit', '-m', `edited ${msg.data.filename}`]);
    FS.chdir(currentRepoDir);
    lg.callMain(['log']);
    FS.chdir(currentRepoDir);
    lg.callMain(['push']);
    FS.chdir(currentRepoDir);
    postMessage({ dircontents: FS.readdir('.') });
  } else if (msg.data.command === 'writefile') {
    FS.chdir(currentRepoDir);
    FS.writeFile(msg.data.filename, msg.data.contents);
    postMessage({ dircontents: FS.readdir('.') });
  } else if (msg.data.command === 'synclocal') {
    const repoName = msg.data.url.substring(msg.data.url.lastIndexOf('/') + 1);
    currentRepoDir = workingDir + '/' + repoName;

    // With OPFS, files are persisted automatically - check if directory exists
    try {
      const contents = FS.readdir(currentRepoDir);
      if (contents.find(file => file === '.git')) {
        createMountPointSymlink(repoName);
        FS.chdir(currentRepoDir);
        postMessage({ dircontents: FS.readdir('.') });
        console.log(repoName, 'found in OPFS');
      } else if (msg.data.newrepo) {
        FS.chdir(currentRepoDir);
        postMessage({ empty: true });
      } else {
        postMessage({ notfound: true });
      }
    } catch (e) {
      // Directory doesn't exist
      if (msg.data.newrepo) {
        FS.mkdir(currentRepoDir);
        FS.chdir(currentRepoDir);
        postMessage({ empty: true });
      } else {
        postMessage({ notfound: true });
      }
    }
  } else if (msg.data.command === 'deletelocal') {
    const repoName = currentRepoDir ? currentRepoDir.split('/').pop() : null;
    try {
      FS.chdir(workingDir);
      if (currentRepoDir) rmdirRecursive(currentRepoDir);
    } catch (e) {
      console.warn('deletelocal error:', e);
    }
    if (repoName) removeMountPointSymlink(repoName);
    postMessage({ deleted: repoName });
  } else if (msg.data.command === 'dir') {
    postMessage({ dircontents: FS.readdir('.') });
  } else if (msg.data.command === 'clone') {
    const repoName = msg.data.url.substring(msg.data.url.lastIndexOf('/') + 1);
    currentRepoDir = workingDir + '/' + repoName;

    // Use absolute path for clone destination to avoid CWD ambiguity
    lg.callMain(['clone', msg.data.url, currentRepoDir]);

    // Create symlink to work around WASMFS getcwd() bug (see comment above)
    createMountPointSymlink(repoName);
    FS.chdir(currentRepoDir);

    postMessage({ dircontents: FS.readdir('.') });
  } else if (msg.data.command === 'readfile') {
    try {
      postMessage({
        filename: msg.data.filename,
        filecontents: FS.readFile(msg.data.filename, { encoding: 'utf8' })
      });
    } catch (e) {
      postMessage({ 'stderr': JSON.stringify(e) });
    }
  } else {
    const args = msg.data.args || [];
    if (currentRepoDir) FS.chdir(currentRepoDir);
    lg.callMain([msg.data.command, ...args]);
    postMessage({ stdout: stdout.join('\n'), stderr: stderr.join('\n'), });
  }

};

postMessage({ 'ready': true });
