describe('wasm-git', function () {
    this.timeout(20000);

    let worker;

    const createWorker = async () => {
        worker = new Worker('base/worker.js');
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

    it('should properly show status --short in case of conflicts', async() => {
        await createWorker();

        await callWorker('clone', {url: `${location.origin}/testrepo.git` });
        await callWorker('status');

        await callWorkerWithArgs('checkout', 'test-branch');
        await callWorker(
            'writefile', {
                filename: 'test.txt',
                contents: '2'
            });
        await callWorker('status');
        const result = await callWorkerWithArgs('status', '--short'); // prints M test.txt
        const t = result.stdout.split('\n');
        debugger
        assert.equal((await callWorkerWithArgs('status', '--short')).stdout.trim(), 'M test.txt');

        // error: failed to checkout tree: 1 conflict prevents checkout
        await callWorkerWithArgs('checkout', 'master');
        await callWorker('stash');
        await callWorkerWithArgs('checkout', 'master');
        await callWorkerWithArgs('stash', 'pop');

        // this returns empty string
        assert.equal((await callWorkerWithArgs('status', '--short')).stdout.trim(), 'DU test.txt');

        worker.terminate();
    });

    it('should show correct "git status --short"', async () => {
        await createWorker();

        await callWorker('clone', { url: `${location.origin}/testrepo.git` });
        await callWorker('status');

        await callWorkerWithArgs('checkout', 'test-branch');
        await callWorker('mkdir', {
            dir: '00-integrations',
        });
        await callWorker('writefile', {
            filename: '00-integrations/metadata.json',
            contents: '{ "name": "integration" }\n',
        });
        await callWorker('writefile', {
            filename: '00-integrations/settings.json',
            contents: '{ }\n',
        });

        // returns ?? 00-integrations/
        // it only recognizes the new folder but not its contents
        assert.equal(
            (await callWorkerWithArgs('status', '--short')).stdout.trim(),
            ' M 00-integrations/metadata.json\n M 00-integrations/settings.json',
        );

        worker.terminate();
    });
});
