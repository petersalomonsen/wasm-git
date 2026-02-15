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
        // OPFS data may persist from a previous test run; clean up via native API
        try {
            const root = await navigator.storage.getDirectory();
            await root.removeEntry('testrepo.git', { recursive: true });
        } catch (e) { /* directory doesn't exist, which is expected */ }
        // Recreate worker so it starts with clean OPFS state
        worker.terminate();
        await createWorker();
        assert.isTrue((await callWorker('synclocal', {url: `${location.origin}/testrepo.git` })).notfound);
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
        // Clean OPFS state and create fresh worker to verify push persisted to server
        try {
            const root = await navigator.storage.getDirectory();
            await root.removeEntry('testrepo.git', { recursive: true });
        } catch (e) { /* directory doesn't exist */ }
        await createWorker();

        // Ensure any WASMFS-cached copy is removed so clone fetches fresh from server
        await callWorker('synclocal', {url: `${location.origin}/testrepo.git` });
        await callWorker('deletelocal');

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
        assert(result.data.dircontents.length > 2, 'clone should have entries, got: ' + JSON.stringify(result.data.dircontents));
        assert(result.data.dircontents.find(entry => entry === '.git'), '.git not found in: ' + JSON.stringify(result.data.dircontents));
        assert(result.data.dircontents.find(entry => entry === 'test.txt'), 'test.txt not found in: ' + JSON.stringify(result.data.dircontents));

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
