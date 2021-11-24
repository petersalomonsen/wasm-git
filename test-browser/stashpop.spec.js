/*
 Expected output with regular git (the difference is in the last status):

peter@MacBook-Air wgtest % echo "hei" > test.txt
peter@MacBook-Air wgtest % git add test.txt 
peter@MacBook-Air wgtest % git commit -m "hei"     
[master (root-commit) 6059cdd] hei
 1 file changed, 1 insertion(+)
 create mode 100644 test.txt
peter@MacBook-Air wgtest % git log
commit 6059cdda2cb06cc517719936d419d934b64307d3 (HEAD -> master)
Author: Peter Salomonsen <pjsalomonsen@gmail.com>
Date:   Tue Nov 23 20:14:50 2021 +0100

    hei
peter@MacBook-Air wgtest % git checkout -b testbranch
Switched to a new branch 'testbranch'
peter@MacBook-Air wgtest % echo "hei" > test2.txt    
peter@MacBook-Air wgtest % git add test2.txt 
peter@MacBook-Air wgtest % git commit -m "heia"      
[testbranch 4892397] heia
 1 file changed, 1 insertion(+)
 create mode 100644 test2.txt
peter@MacBook-Air wgtest % echo "hei2" > test2.txt
peter@MacBook-Air wgtest % git checkout master
error: Your local changes to the following files would be overwritten by checkout:
	test2.txt
Please commit your changes or stash them before you switch branches.
Aborting
peter@MacBook-Air wgtest % git stash 
Saved working directory and index state WIP on testbranch: 4892397 heia
peter@MacBook-Air wgtest % git checkout master
Switched to branch 'master'
peter@MacBook-Air wgtest % git stash pop
CONFLICT (modify/delete): test2.txt deleted in Updated upstream and modified in Stashed changes. Version Stashed changes of test2.txt left in tree.
The stash entry is kept in case you need it again.
peter@MacBook-Air wgtest % git status --short
DU test2.txt
peter@MacBook-Air wgtest % git status
On branch master
Unmerged paths:
  (use "git restore --staged <file>..." to unstage)
  (use "git add/rm <file>..." as appropriate to mark resolution)
	deleted by us:   test2.txt

no changes added to commit (use "git add" and/or "git commit -a")
peter@MacBook-Air wgtest % git status --short
DU test2.txt

 */

describe('wasm-git-stash-pop', function () {
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

    this.beforeAll(async () => {
        await createWorker();
        await callWorker('synclocal', {url: `${location.origin}/teststash.git`, newrepo: true });
    });

    this.afterAll(async () => {
        assert.equal((await callWorker('deletelocal')).deleted, 'teststash.git');
        worker.terminate();
    });

    it('should create repo pop and stash, and show conflict', async () => {
        await callWorkerWithArgs('init', '.');
        await callWorker(
            'writefile', {
                filename: 'test.txt',
                contents: 'blabla'
        });
        await callWorkerWithArgs('add', 'test.txt');
        await callWorkerWithArgs('commit', '-m', 'first commit');
        await callWorkerWithArgs('checkout', '-b', 'testbranch');
        await callWorker(
            'writefile', {
                filename: 'test2.txt',
                contents: 'blabla'
        });
        await callWorkerWithArgs('add', 'test2.txt');
        await callWorkerWithArgs('commit', '-m', 'second commit');
        await callWorker(
            'writefile', {
                filename: 'test2.txt',
                contents: 'blabla2'
        });
        assert.isTrue((await callWorkerWithArgs('checkout', 'master')).stderr.indexOf('1 conflict prevents checkout')>-1);
        await callWorkerWithArgs('stash');
        assert.equal((await callWorkerWithArgs('checkout', 'master')).stderr,'');
        assert.equal((await callWorker('dir')).dircontents.findIndex(f => f==='test2.txt'), -1);
        await callWorkerWithArgs('stash', 'pop');
        assert.isTrue((await callWorker('dir')).dircontents.findIndex(f => f==='test2.txt')>-1);
        // This part is different in libgit2 status from cmd line git
        // assert.equal((await callWorker('status')).stdout, 'DU test2.txt');
        console.log((await callWorker('status')).stdout);
        assert.isTrue((await callWorker('status')).stdout.indexOf('conflict: a:test2.txt o:NULL t:test2.txt') >0 );
    });
});