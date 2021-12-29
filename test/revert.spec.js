const lgPromise = require('./common.js').lgPromise;
const assert = require('assert');

describe('git revert', () => {
    beforeEach(async () => {
        (await lgPromise).FS.chdir('/working');
        console.log('cwd', (await lgPromise).FS.cwd());
    });
    it('should revert commit', async () => {
        const lg = await lgPromise;
        const FS = lg.FS;
        FS.writeFile('/home/web_user/.gitconfig', '[user]\n' +
            'name = Test User\n' +
            'email = test@example.com');

        FS.mkdir('testrevert');
        FS.chdir('testrevert');
        lg.callMain(['init', '.']);

        FS.writeFile('test.txt', 'text 1');
        lg.callMain(['add', 'test.txt']);
        lg.callMain(['commit', '-m', 'test commit']);

        assert.equal(FS.readFile('test.txt', { encoding: 'utf8' }), 'text 1');
        FS.writeFile('test.txt', 'text 2');
        lg.callMain(['add', 'test.txt']);
        lg.callMain(['commit', '-m', 'test commit 2']);

        lg.callMain(['revert', 'HEAD']);

        assert.equal(FS.readFile('test.txt', { encoding: 'utf8' }), 'text 1',
            'expecting file content to be reverted');

        assert.match(lg.callWithOutput(['status']),/modified:\s+test.txt/);

        lg.callMain(['commit', '-m', 'reverted to commit 1']);
        assert.equal(lg.callWithOutput(['status']),'# On branch master');
    });
});
