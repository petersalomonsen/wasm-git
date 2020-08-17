const lgPromise = require('./common.js').lgPromise;

describe('git fetch', () => {
    it('should create 1 bare and 2 clones and fetch changes', async () => {
        const lg = await lgPromise;
        const FS = lg.FS;
        FS.mkdir('bare');
        FS.chdir('bare');
        lg.callMain(['init', '--bare', '.']);

        FS.chdir('..');
        lg.callMain(['clone', 'bare', 'test1']);        

        FS.chdir('test1');
        FS.writeFile('test.txt', 'abcdef');
        lg.callMain(['add', 'test.txt']);
        lg.callMain(['commit', '-m', 'test commit']);
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
        
        lg.callMain(['log']);
    });
});
