describe('wasm-git workerfs variant', function () {
    this.timeout(20000);

    let worker;

    const createWorker = async () => {
        worker = new Worker(new URL('worker.js', import.meta.url), { type: 'module' });
        await new Promise(resolve => {
            worker.onmessage = msg => {
                if (msg.data.ready) {
                    resolve(msg);
                }
            }
        });
    };

    const callWorker = async (command, params) => {
        return await new Promise(resolve => {
            worker.onmessage = msg => resolve(msg.data);
            worker.postMessage(Object.assign({
                command: command
            }, params));
        });
    };

    this.afterAll(async () => {
        worker.terminate();
    });

    it('should get ready message from web worker', async () => {
        await createWorker();
    });

    it('should mount a blob with WORKERFS and read it back', async () => {
        const result = await callWorker('mountworkerfs', {
            filename: 'blobfile.txt',
            contents: 'hello from a workerfs blob'
        });
        assert(!result.stderr, `workerfs mount failed: ${result.stderr}`);
        assert.equal(result.filecontents, 'hello from a workerfs blob');
        assert(result.dircontents.includes('blobfile.txt'));
    });

    it('should keep the git index on MEMFS with --index-file', async () => {
        const result = await callWorker('initandadd');
        assert(!result.stderr, `git add failed: ${result.stderr}`);
        assert.equal(result.exitcode, 0);
        assert(result.indexOnMemfs, 'index was not written to /gitindex');
        assert(result.noIndexInRepo, '.git/index should not be written when --index-file is used');
    });
});
