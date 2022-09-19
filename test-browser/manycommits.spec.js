function workerFunction() {
    let stdout = [];
    let stderr = [];

    var Module = {
        'print': function (text) {
            console.log(text);
            stdout.push(text)
        },
        'printErr': function (text) {
            console.error(text);
            stderr.push(text);
        },
        locateFile: function (s) {
            return 'SCRIPTURLBASE/base/' + s;
        }
    };


    importScripts('SCRIPTURLBASE/base/lg2.js');

    Module.onRuntimeInitialized = () => {
        FS.mkdir('/working');
        FS.mount(MEMFS, {}, '/working');
        FS.chdir('/working');

        FS.writeFile('/home/web_user/.gitconfig', '[user]\n' +
            'name = Test User\n' +
            'email = test@example.com');

        FS.mkdir('/working/testrepo');
        FS.chdir('/working/testrepo');
        Module.callMain(['init', '.']);
        text = '';
        for (let i = 0; i < 10; i++) {
            console.log(i);
            text += 'x';
            FS.writeFile('./test.txt', text);
            Module.callMain(['add', '.']);
            Module.callMain(['commit', '-m', 'commit ' + (i + 1)]);
        }
        postMessage(stderr);
    }
}

describe('many commits and error creating signature', function () {
    it('should not get error creating signature on many repeated commits', async () => {
        let workerFunctionString = workerFunction.toString();
        workerFunctionString = workerFunctionString.split('\n').filter((v, n, a) => n > 0 && n < a.length - 1).join('\n');
        workerFunctionString = workerFunctionString.replace(/SCRIPTURLBASE/g, location.origin);
        const worker = new Worker(URL.createObjectURL(new Blob([workerFunctionString], { type: 'application/javascript' })));
        const result = await new Promise(resolve => worker.onmessage = (msg) => resolve(msg.data));
        expect(result).not.contain(`Error creating signature [-3] - config value 'user.name' was not found`);
    });
});