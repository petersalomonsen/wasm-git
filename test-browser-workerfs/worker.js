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

const lg2mod = await import(new URL('lg2_workerfs.js', import.meta.url));
const lg = await lg2mod.default();

const FS = lg.FS;
const WORKERFS = lg.WORKERFS;

onmessage = (msg) => {
  stderr = [];
  stdout = [];
  if (msg.data.command === 'mountworkerfs') {
    try {
      FS.mkdir('/workerfs');
      FS.mount(WORKERFS, {
        blobs: [{ name: msg.data.filename, data: new Blob([msg.data.contents]) }]
      }, '/workerfs');
      postMessage({
        filename: msg.data.filename,
        filecontents: FS.readFile(`/workerfs/${msg.data.filename}`, { encoding: 'utf8' }),
        dircontents: FS.readdir('/workerfs')
      });
    } catch (e) {
      postMessage({ 'stderr': JSON.stringify(e) });
    }
  } else if (msg.data.command === 'initandadd') {
    // git operations in MEMFS with the index redirected through --index-file
    FS.mkdir('/workerfstestrepo');
    FS.chdir('/workerfstestrepo');
    lg.callMain(['init', '.']);
    FS.writeFile('/workerfstestrepo/newfile.txt', 'hello workerfs variant');
    const code = lg.callMain(['--index-file', '/gitindex', 'add', 'newfile.txt']);
    postMessage({
      exitcode: code,
      indexOnMemfs: FS.analyzePath('/gitindex').exists,
      noIndexInRepo: !FS.analyzePath('/workerfstestrepo/.git/index').exists,
      stagedFiles: stdout.join('\n'),
      stderr: stderr.join('\n')
    });
  } else {
    const args = msg.data.args || [];
    lg.callMain([msg.data.command, ...args]);
    postMessage({ stdout: stdout.join('\n'), stderr: stderr.join('\n'), });
  }
};

postMessage({ 'ready': true });
