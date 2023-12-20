const lgPromise = require('./common.js').lgPromise;
const assert = require('assert');

describe.only('hello wasmfs', () => {    
    it.only('hello wasmfs', async () => {
        const lg = await lgPromise;
        const FS = lg.FS;


        FS.mkdir('/test');
        FS.chdir('/test');
        lg.callMain(['init', '.']);
        lg.callMain(['config', 'user.name', 'test']);
        lg.callMain(['config', 'user.email', 'test@example.com']);
        FS.writeFile('test.txt', 'abcdef');
        lg.callMain(['add', 'test.txt']);
        lg.callMain(['commit', '-m', 'test commit']);
        lg.callMain(['log']);
    });
});
