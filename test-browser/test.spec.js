describe('wasm-git', function() {
    const worker = new Worker('base/worker.js');

    const workerReadyPromise = new Promise(resolve => {
        worker.onmessage = msg => {
            if (msg.data.ready) {
                resolve(msg);
            }
        }
    });

    it('should get ready message from web worker', async () => {
        const msg = await workerReadyPromise;
        assert(msg.data.ready);
    });

    it('should ping the gitserver', async () => {
        const result = await fetch('/testrepo.git/ping').then(res => res.text());
        assert.equal(result, 'pong');
    });

    it('should sync local idbfs and find no repository', async () => {
        worker.postMessage({command: 'synclocal', url: `${location.origin}/testrepo.git`});
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
        worker.postMessage({command: 'clone', url: `${location.origin}/testrepo.git`});
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

    it('remove the local clone of the repository', async () => {
        worker.postMessage({command: 'deletelocal'});
        let result = await new Promise(resolve =>
            worker.onmessage = msg => {
                if (msg.data.deleted) {
                    resolve(msg);
                } else {
                    console.log(msg.data);
                }                
            }
        );
        assert.equal(result.data.deleted, 'testrepo.git');
    });

    it('should clone the repository with contents', async () => {
        worker.postMessage({command: 'readfile', filename: 'test.txt'});
        let result = await new Promise(resolve =>
            worker.onmessage = msg => {
                if (msg.data.stderr) {
                    resolve(msg);
                } else {
                    console.log(msg.data);
                }                
            }
        );
        assert.exists(result.data.stderr);

        worker.postMessage({command: 'clone', url: `${location.origin}/testrepo.git`});
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

        worker.postMessage({command: 'readfile', filename: 'test.txt'});
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