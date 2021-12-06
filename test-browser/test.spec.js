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

    it('should sync local idbfs and find no repository', async () => {
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
        console.log(`1 second pause to make sure we don't get another log entry in the same second`);
        await new Promise(r => setTimeout(r, 1000));
    });

    it('remove the local clone of the repository', async () => {        
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
    it('should create new branch', async () => {
        await callWorkerWithArgs('checkout', 'testbranch');
        assert.equal((await callWorker('status')).stdout.split('\n')[0], '# On branch master');
        await callWorkerWithArgs('checkout', '-b', 'testbranch');
        assert.equal((await callWorker('status')).stdout.split('\n')[0], '# On branch testbranch');
    });
    it('should reset to HEAD~1', async () => {
        await callWorker(
            'writecommitandpush', {
                filename: 'test2.txt',
                contents: 'hello world2!'
        });
        const commitLogBeforeReset = (await callWorker('log')).stdout.split('\n').filter(l => l.indexOf('commit ')===0);
        await callWorkerWithArgs('reset', 'HEAD~1');
        const commitLogAfterReset = (await callWorker('log')).stdout.split('\n').filter(l => l.indexOf('commit ')===0);
        assert.equal(commitLogAfterReset[0],commitLogBeforeReset[1]);
        assert.isTrue((await callWorker('dir')).dircontents.indexOf('test2.txt')>-1);
    });
    it('should show 1 ahead', async() => {
        await callWorkerWithArgs('checkout', 'master');
        await callWorkerWithArgs('status');
        await callWorkerWithArgs('add', 'test2.txt');
        await callWorkerWithArgs('commit', '-m', 'add test2');
        const aheadbehind = (await callWorkerWithArgs('status')).stdout.split('\n')[1];
        assert.equal('# Your branch is ahead by 1, behind by 0 commits.',aheadbehind);
    });
    it('should find the new branch after cloning', async() => {
        assert.equal((await callWorker('deletelocal')).deleted, 'testrepo.git');
        worker.terminate();
        await createWorker();
        assert.isTrue((await callWorker('synclocal', {url: `${location.origin}/testrepo.git` })).notfound);
        await callWorker('clone', {url: `${location.origin}/testrepo.git` });
        await callWorkerWithArgs('checkout', 'testbranch');
        assert.equal((await callWorker('status')).stdout.split('\n')[0], '# On branch testbranch');
    });
    it('the new branch should have been set up with remote tracking', async() => {
        let config = (await callWorker('readfile', { filename: '.git/config' })).filecontents;
        assert.isTrue(config.indexOf(`[branch "testbranch"]`) > -1)
    });
    it('should reset hard to HEAD~1', async () => {
        const commitLogBeforeCommit = (await callWorker('log')).stdout.split('\n').filter(l => l.indexOf('commit ')===0);
        console.log('before commit', commitLogBeforeCommit[0], commitLogBeforeCommit[1], commitLogBeforeCommit[2]);
        let result = await callWorker(
            'writecommitandpush', {
                filename: 'testResetHard.txt',
                contents: 'hello world! reset hard'
        });
        assert.isTrue(result.dircontents.indexOf('testResetHard.txt')>0);
        const commitLogBeforeReset = (await callWorker('log')).stdout.split('\n').filter(l => l.indexOf('commit ')===0);
        console.log('before reset', commitLogBeforeReset[0], commitLogBeforeReset[1], commitLogBeforeReset[2]);
        result = await callWorkerWithArgs('reset', '--hard', 'HEAD~1');
        console.log('stderr after reset',result.stderr);
        const commitLogAfterReset = (await callWorker('log')).stdout.split('\n').filter(l => l.indexOf('commit ')===0);
        console.log('after reset', commitLogAfterReset[0], commitLogAfterReset[1]);
        assert.equal(commitLogAfterReset[0],commitLogBeforeReset[1]);
        assert.equal((await callWorker('dir')).dircontents.indexOf('testResetHard.txt'),-1);
    });
    it('should show 1 behind after previous hard reset', async() => {
        const aheadbehind = (await callWorkerWithArgs('status')).stdout.split('\n')[1];
        assert.equal(aheadbehind, '# Your branch is ahead by 0, behind by 1 commits.');
    });
    it('should be able to create a new branch on a new repo that is not cloned', async() => {
        assert.equal((await callWorker('deletelocal')).deleted, 'testrepo.git');
        worker.terminate();
        await createWorker();
        assert.isTrue((await callWorker('synclocal', {url: `${location.origin}/testrepo.git`, newrepo: true })).empty);
        
        await callWorkerWithArgs('init', '.');
        await callWorker(
            'writefile', {
                filename: 'test44.txt',
                contents: 'hello world5!'
        });
        await callWorkerWithArgs('add', 'test44.txt');
        await callWorkerWithArgs('commit', '-m', 'another test commit');
        assert.equal((await callWorkerWithArgs('checkout', '-b', 'testbranch')).stderr, '');
        assert.equal((await callWorker('status')).stdout.split('\n')[0], '# On branch testbranch');
    });
    it('should be able to apply and drop specific stash index', async() => {
        assert.equal((await callWorker('deletelocal')).deleted, 'testrepo.git');
        worker.terminate();
        await createWorker();
        assert.isTrue((await callWorker('synclocal', {url: `${location.origin}/testrepo.git`, newrepo: true })).empty);

        await callWorkerWithArgs('init', '.');
        await callWorker(
            'writefile', {
                filename: 'test.txt',
                contents: 'hello world'
            });
        await callWorkerWithArgs('add', 'test.txt');
        await callWorkerWithArgs('commit', '-m', 'initial commit');

        await callWorker(
            'writefile', {
                filename: 'test2.txt',
                contents: 'test2'
            });
        await callWorkerWithArgs('add', 'test2.txt');
        assert.isTrue((await callWorker('dir')).dircontents.includes('test2.txt'));
        await callWorker('stash');
        assert.isFalse((await callWorker('dir')).dircontents.includes('test2.txt'));

        await callWorker(
            'writefile', {
                filename: 'test3.txt',
                contents: 'test3'
            });
        await callWorkerWithArgs('add', 'test3.txt');

        assert.isTrue((await callWorker('dir')).dircontents.includes('test3.txt'));
        await callWorker('stash');
        assert.isFalse((await callWorker('dir')).dircontents.includes('test3.txt'));
        assert.isTrue((await callWorkerWithArgs('stash', 'list')).stdout.split('\n').length === 2);

        await callWorkerWithArgs('stash', 'apply', '1');
        await callWorkerWithArgs('stash', 'drop', '1');

        assert.isTrue((await callWorker('dir')).dircontents.includes('test2.txt'));
        assert.isFalse((await callWorker('dir')).dircontents.includes('test3.txt'));

        const stashListOutput = (await callWorkerWithArgs('stash', 'list')).stdout;
        assert.isTrue(stashListOutput.split('\n').length === 1);
        assert.isTrue(stashListOutput.startsWith('stash@{0}:'));
    });
});
