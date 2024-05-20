describe('remotes', function () {
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
    const callWorkerWithArgs = async (command, ...args) => {
        return await new Promise(resolve => {
            worker.onmessage = msg => resolve(msg.data)
            worker.postMessage({
                command: command,
                args: args
            });    
        });
    };

    this.beforeAll(async () => {
        await createWorker();
        await callWorker('synclocal', {url: `${location.origin}/testremote.git`, newrepo: true });
    });

    this.afterAll(async () => {
        assert.equal((await callWorker('deletelocal')).deleted, 'testremote.git');
        worker.terminate();
    });

    it('should be possible to create a new repo locally, set remotes and push', async () => {
        await callWorkerWithArgs('init', '.');
        await callWorker(
            'writefile', {
                filename: 'test.txt',
                contents: 'blabla'
        });
        await callWorkerWithArgs('add', 'test.txt');
        await callWorkerWithArgs('commit', '-m', 'first commit');
        await callWorker(
            'writefile', {
                filename: 'test2.txt',
                contents: 'blabla'
        });
        await callWorkerWithArgs('add', 'test2.txt');
        await callWorkerWithArgs('commit', '-m', 'second commit');
        assert.isTrue((await callWorker('push')).stderr.indexOf("remote 'origin' does not exist") > -1);
        await callWorkerWithArgs('remote', 'add', 'origin', `${location.origin}/testremote.git`);
        assert.equal((await callWorker('push')).stderr, '');
        assert.equal((await callWorkerWithArgs('fetch', 'origin')).stderr, '');
    });
});