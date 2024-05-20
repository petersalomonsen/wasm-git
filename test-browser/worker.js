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

const lg2mod = await import(new URL('lg2.js', import.meta.url));
const lg = await lg2mod.default();

const FS = lg.FS;
const IDBFS = lg.IDBFS;

const username = 'Test User';
const useremail = 'test@example.com';

FS.writeFile('/home/web_user/.gitconfig',
  `[user]
name = ${username}
email = ${useremail}`);

let currentRepoRootDir;

onmessage = (msg) => {
  stderr = [];
  stdout = [];
  if (msg.data.command === 'writecommitandpush') {
    FS.writeFile(msg.data.filename, msg.data.contents);
    lg.callMain(['add', '--verbose', msg.data.filename]);
    lg.callMain(['commit', '-m', `edited ${msg.data.filename}`]);
    lg.callMain(['log']);
    FS.syncfs(false, () => {
      console.log(currentRepoRootDir, 'stored to indexeddb');
      lg.callMain(['push']);
      postMessage({ dircontents: FS.readdir('.') });
    });
  } else if (msg.data.command === 'writefile') {
    FS.writeFile(msg.data.filename, msg.data.contents);
    FS.syncfs(false, () => {
      console.log(currentRepoRootDir, 'stored to indexeddb');
      postMessage({ dircontents: FS.readdir('.') });
    });
  } else if (msg.data.command === 'synclocal') {
    currentRepoRootDir = msg.data.url.substring(msg.data.url.lastIndexOf('/') + 1);
    console.log('synclocal', currentRepoRootDir);

    FS.mkdir(`/${currentRepoRootDir}`);
    FS.mount(IDBFS, {}, `/${currentRepoRootDir}`);

    FS.syncfs(true, () => {
      if (FS.readdir(`/${currentRepoRootDir}`).find(file => file === '.git')) {
        FS.chdir(`/${currentRepoRootDir}`);
        postMessage({ dircontents: FS.readdir('.') });
        console.log(currentRepoRootDir, 'restored from indexeddb');
      } else if (msg.data.newrepo) {
        FS.chdir(`/${currentRepoRootDir}`);
        postMessage({ empty: true });
      } else {
        FS.chdir('/');
        postMessage({ notfound: true });
      }
    });
  } else if (msg.data.command === 'deletelocal') {
    FS.unmount(`/${currentRepoRootDir}`);
    self.indexedDB.deleteDatabase('/' + currentRepoRootDir);
    postMessage({ deleted: currentRepoRootDir });
  } else if (msg.data.command === 'dir') {
    postMessage({ dircontents: FS.readdir('.') });
  } else if (msg.data.command === 'clone') {
    currentRepoRootDir = msg.data.url.substring(msg.data.url.lastIndexOf('/') + 1);

    lg.callMain(['clone', msg.data.url, currentRepoRootDir]);
    FS.chdir(currentRepoRootDir);

    FS.syncfs(false, () => {
      console.log(currentRepoRootDir, 'stored to indexeddb');
      postMessage({ dircontents: FS.readdir('.') });
    });
  } else if (msg.data.command === 'pull') {
    lg.callMain(['fetch', 'origin']);
    lg.callMain(['merge', 'origin/master']);
    FS.syncfs(false, () => {
      console.log(currentRepoRootDir, 'stored to indexeddb');
    });
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
