describe('wasm-git OPFS', function () {
    this.timeout(20000);

    let worker;

    const createWorker = async () => {
        worker = new Worker(new URL('worker.js', import.meta.url), {type: 'module'});
        await new Promise(resolve => {
            worker.onmessage = msg => {
                if (msg.data.ready) {
                    resolve(msg);
                }
            }
        });
    }

    const callWorker = async (command, params) => {
        return await new Promise(resolve => {
            worker.onmessage = msg => resolve(msg.data);
            worker.postMessage(Object.assign({
                command: command
            }, params));
        });
    };

    this.afterAll(async () => {
        assert.equal((await callWorker('deletelocal')).deleted, 'testrepo.git');
        worker.terminate();
    });

    it('should get ready message from web worker', async () => {
        await createWorker();
    });

    it('should ping the gitserver', async () => {
        const result = await fetch('/testrepo.git/ping').then(res => res.text());
        assert.equal(result, 'pong');
    });

    it('should find no existing repository', async () => {
        worker.postMessage({ command: 'synclocal', url: `${location.origin}/testrepo.git` });
        let result = await new Promise(resolve =>
            worker.onmessage = msg => {
                if (msg.data.notfound) {
                    resolve(msg);
                } else {
                    console.log(msg.data);
                }
            }
        );
        assert(result.data.notfound);
    });

    it('should clone a bare repository and push commits', async () => {
        worker.postMessage({ command: 'clone', url: `${location.origin}/testrepo.git` });
        let result = await new Promise(resolve =>
            worker.onmessage = msg => {
                if (msg.data.dircontents) {
                    resolve(msg);
                } else {
                    console.log(msg.data);
                }
            }
        );
        assert(result.data.dircontents.length > 2);
        assert(result.data.dircontents.find(entry => entry === '.git'));

        worker.postMessage({
            command: 'writecommitandpush',
            filename: 'test.txt',
            contents: 'hello world!'
        });
        result = await new Promise(resolve =>
            worker.onmessage = msg => {
                if (msg.data.dircontents) {
                    resolve(msg);
                } else {
                    console.log(msg.data);
                }
            }
        );
        assert(result.data.dircontents.find(entry => entry === 'test.txt'));
    });

    it('should remove the local clone of the repository', async () => {
        assert.equal((await callWorker('deletelocal')).deleted, 'testrepo.git');
        worker.terminate();
    });

    it('should clone the repository with contents', async () => {
        await createWorker();
        assert.isTrue((await callWorker('synclocal', {url: `${location.origin}/testrepo.git` })).notfound);

        let result = await callWorker('readfile', { filename: 'test.txt' });
        assert.exists(result.stderr);

        worker.postMessage({ command: 'clone', url: `${location.origin}/testrepo.git` });
        result = await new Promise(resolve =>
            worker.onmessage = msg => {
                if (msg.data.dircontents) {
                    resolve(msg);
                } else {
                    console.log(msg.data);
                }
            }
        );
        assert(result.data.dircontents.length > 2);
        assert(result.data.dircontents.find(entry => entry === '.git'));
        assert(result.data.dircontents.find(entry => entry === 'test.txt'));

        worker.postMessage({ command: 'readfile', filename: 'test.txt' });
        result = await new Promise(resolve =>
            worker.onmessage = msg => {
                if (msg.data.filecontents) {
                    resolve(msg);
                } else {
                    console.log(msg.data);
                }
            }
        );
        assert.equal(result.data.filecontents, 'hello world!');
    });
});
