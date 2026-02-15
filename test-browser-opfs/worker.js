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
const mkdirResult = lg._lg2_create_directory(workingDir, 0o777, backend);
if (mkdirResult !== 0) {
    throw new Error('Failed to create OPFS directory, error: ' + mkdirResult);
}
FS.chdir(workingDir);

let currentRepoRootDir;

function rmdirRecursive(path) {
  const entries = FS.readdir(path).filter(e => e !== '.' && e !== '..');
  for (const entry of entries) {
    const fullPath = path + '/' + entry;
    const stat = FS.stat(fullPath);
    if (FS.isDir(stat.mode)) {
      rmdirRecursive(fullPath);
    } else {
      FS.unlink(fullPath);
    }
  }
  FS.rmdir(path);
}

onmessage = (msg) => {
  stderr = [];
  stdout = [];
  if (msg.data.command === 'writecommitandpush') {
    FS.writeFile(msg.data.filename, msg.data.contents);
    lg.callMain(['add', '--verbose', msg.data.filename]);
    lg.callMain(['commit', '-m', `edited ${msg.data.filename}`]);
    lg.callMain(['log']);
    lg.callMain(['push']);
    postMessage({ dircontents: FS.readdir('.') });
  } else if (msg.data.command === 'writefile') {
    FS.writeFile(msg.data.filename, msg.data.contents);
    postMessage({ dircontents: FS.readdir('.') });
  } else if (msg.data.command === 'synclocal') {
    currentRepoRootDir = msg.data.url.substring(msg.data.url.lastIndexOf('/') + 1);
    console.log('synclocal', currentRepoRootDir);

    // With OPFS, files are persisted automatically - check if directory exists
    try {
      const contents = FS.readdir(currentRepoRootDir);
      if (contents.find(file => file === '.git')) {
        FS.chdir(currentRepoRootDir);
        postMessage({ dircontents: FS.readdir('.') });
        console.log(currentRepoRootDir, 'found in OPFS');
      } else if (msg.data.newrepo) {
        FS.chdir(currentRepoRootDir);
        postMessage({ empty: true });
      } else {
        postMessage({ notfound: true });
      }
    } catch (e) {
      // Directory doesn't exist
      if (msg.data.newrepo) {
        FS.mkdir(currentRepoRootDir);
        FS.chdir(currentRepoRootDir);
        postMessage({ empty: true });
      } else {
        postMessage({ notfound: true });
      }
    }
  } else if (msg.data.command === 'deletelocal') {
    try {
      FS.chdir(workingDir);
      rmdirRecursive(workingDir + '/' + currentRepoRootDir);
    } catch (e) {
      console.warn('deletelocal error:', e);
    }
    postMessage({ deleted: currentRepoRootDir });
  } else if (msg.data.command === 'dir') {
    postMessage({ dircontents: FS.readdir('.') });
  } else if (msg.data.command === 'clone') {
    currentRepoRootDir = msg.data.url.substring(msg.data.url.lastIndexOf('/') + 1);

    lg.callMain(['clone', msg.data.url, currentRepoRootDir]);
    FS.chdir(currentRepoRootDir);

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
    lg.callMain([msg.data.command, ...args]);
    postMessage({ stdout: stdout.join('\n'), stderr: stderr.join('\n'), });
  }

};

postMessage({ 'ready': true });
