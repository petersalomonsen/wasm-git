const assert = require('assert');
const lgPromise = require('./common.js').lgPromise;

describe('git fetch', () => {
    beforeEach(async () => {
        (await lgPromise).FS.chdir('/working');
        console.log('cwd', (await lgPromise).FS.cwd());
    });
    it('should create 1 bare and 2 clones and fetch changes', async () => {
        const lg = await lgPromise;
        const FS = lg.FS;
        lg.callMain(['config', 'user.name', 'The Tester']);
        lg.callMain(['config', 'user.email', 'test@testing.com']);
    
        FS.mkdir('bare');
        FS.chdir('bare');
        lg.callMain(['init', '--bare', '.']);

        FS.chdir('..');
        lg.callMain(['clone', 'bare', 'test1']);        

        FS.chdir('test1');
        FS.writeFile('test.txt', 'abcdef');
        lg.callMain(['add', 'test.txt']);
        lg.callMain(['commit', '-m', 'test commit 1']);
        lg.callMain(['push']);
        FS.chdir('..');
        
        lg.callMain(['clone', 'bare', 'test2']);
        FS.chdir('test2');
        FS.writeFile('test2.txt', 'abcdef');
        lg.callMain(['add', 'test2.txt']);
        lg.callMain(['commit', '-m', 'test commit 2']);
        
        lg.callMain(['push']);
        
        lg.callMain(['log']);
        FS.chdir('..');

        FS.chdir('test1');
        
        lg.callMain(['fetch', 'origin']);
        lg.callMain(['merge', 'origin/master']);
        
        const result = lg.callWithOutput(['log']);
        assert.ok(result.indexOf('test commit 2') > 0);
        assert.ok(result.indexOf('test commit 1') > result.indexOf('test commit 2') > 0);

        lg.callMain(['checkout', '-b', 'testbranch']);
        FS.writeFile('testinbranch.txt', 'abcdef');
        lg.callMain(['add', 'testinbranch.txt']);
        lg.callMain(['commit', '-m', 'test in branch']);
        lg.callMain(['push']);

        FS.chdir('..');

        FS.chdir('test2');

        assert.equal(FS.analyzePath('testinbranch.txt').exists, false);
        lg.callMain(['fetch', 'origin']);
        lg.callMain(['checkout', 'testbranch']);

        assert.match(lg.callWithOutput(['status']), /On branch testbranch/);
        assert.equal(FS.analyzePath('testinbranch.txt').exists, true);
        assert.equal(FS.readFile('testinbranch.txt', {encoding: 'utf8'}), 'abcdef');
    });
});
