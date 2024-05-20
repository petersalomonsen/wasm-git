let stdout = [];
let stderr = [];

/*var Module = {
    'print': function (text) {
        console.log(text);
        stdout.push(text)
    },
    'printErr': function (text) {
        console.error(text);
        stderr.push(text);
    },
    locateFile: function (s) {
        return 'SCRIPTURLBASE/test-browser/' + s;
    }
};*/


const lg2mod = await import(new URL('lg2.js', import.meta.url));
const lg2 = await lg2mod.default();
const FS = lg2.FS;
const MEMFS = lg2.MEMFS;

FS.mkdir('/working');
FS.mount(MEMFS, {}, '/working');
FS.chdir('/working');

FS.writeFile('/home/web_user/.gitconfig', '[user]\n' +
    'name = Test User\n' +
    'email = test@example.com');

FS.mkdir('/working/testrepo');
FS.chdir('/working/testrepo');
lg2.callMain(['init', '.']);
lg2.callMain(['config', 'user.name', 'Test']);
lg2.callMain(['config', 'user.email', 'test@example.com']);
let text = '';
for (let i = 0; i < 10; i++) {
    console.log(i);
    text += 'x';
    FS.writeFile('./test.txt', text);
    lg2.callMain(['add', '.']);
    lg2.callMain(['commit', '-m', 'commit ' + (i + 1)]);
}
postMessage(stderr);
