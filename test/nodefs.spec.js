const lgPromise = require('./common.js').lgPromise;
const assert = require('assert');
const { rmSync } = require('fs');

describe('nodefs', function () {
    this.timeout(20000);

    it('should clone using nodefs', async () => {        
        const lg = await lgPromise;

        const FS = lg.FS;
        const NODEFS = FS.filesystems.NODEFS;
        const clonedir = 'nodefsclonetest';

        FS.mkdir('/nodefs');
        FS.mount(NODEFS, { root: '.' }, '/nodefs');
        FS.chdir('/nodefs');

        FS.writeFile('/home/web_user/.gitconfig', '[user]\n' +
            'name = Test User\n' +
            'email = test@example.com');

        // clone a repository from github
        lg.callMain(['clone', 'https://github.com/petersalomonsen/wasm-git.git', clonedir]);

        FS.chdir(clonedir);
        console.log(FS.readdir('.'));
        lg.callMain(['log']);

        assert(FS.readdir('.').indexOf('README.md') > -1);
        FS.chdir('..');
        rmSync('clonedir', {recursive: true, force: true});
        console.log('clone to nodefs suceeded');
    });
});
