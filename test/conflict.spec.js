const lgPromise = require('./common.js').lgPromise;
const assert = require('assert');

describe('conflicts', function() {
    beforeEach(async () => {
        (await lgPromise).FS.chdir('/working');
        console.log('cwd', (await lgPromise).FS.cwd());
    });
    it('should create 1 bare and 2 clones and create/resolve conflicts', async () => {
        const lg = await lgPromise;
        const FS = lg.FS;
        FS.mkdir('bareconflicts');
        FS.chdir('bareconflicts');
        lg.callMain(['init', '--bare', '.']);

        FS.chdir('..');
        lg.callMain(['clone', 'bareconflicts', 'testconflicts1']);        

        FS.chdir('testconflicts1');
        FS.writeFile('test.txt', 'abcdef');
        lg.callMain(['add', 'test.txt']);
        lg.callMain(['commit', '-m', 'test commit 1']);
        lg.callMain(['push']);
        FS.chdir('..');

        lg.callMain(['clone', 'bareconflicts', 'testconflicts2']);

        FS.chdir('testconflicts1');
        FS.writeFile('test.txt', 'abc');
        lg.callMain(['add', 'test.txt']);
        lg.callMain(['commit', '-m', 'test commit 2']);
        lg.callMain(['push']);
        FS.chdir('..');

        FS.chdir('testconflicts2');                
        FS.writeFile('test.txt', 'hijklmn');
        lg.callMain(['add', 'test.txt']);
        lg.callMain(['commit', '-m', 'test commit 3']);
        
        try {
            lg.callWithOutput(['push']);
            assert.fail('should reject pushing');
        } catch(e) {
            assert.match(e, /cannot push because a reference that you are trying to update on the remote contains commits that are not present locally/)       
        }

        lg.callMain(['fetch','origin']);
        lg.callMain(['merge', 'origin/master']);

        assert.match(lg.callWithOutput(['status']), /conflict\: a\:test\.txt o\:test\.txt t\:test\.txt/);

        FS.writeFile('test.txt', 'abcxyz');
        lg.callMain(['add', 'test.txt']);
        lg.callMain(['commit', '-m', 'resolved conflict']);

        assert.match(lg.callWithOutput(['log']), /resolved conflict/);
        assert.match(lg.callWithOutput(['push']),/pushed/);
        console.log('status', lg.callWithOutput(['status']));
        assert.equal('abcxyz', FS.readFile('test.txt', {encoding: 'utf8'}));
    });
});