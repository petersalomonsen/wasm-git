module.exports = {
    lgPromise: new Promise(resolve => {
        const lg = require('./lg2.js');
        lg.onRuntimeInitialized = () => {
            const FS = lg.FS;
            const MEMFS = FS.filesystems.MEMFS;

            FS.mkdir('/working');
            FS.mount(MEMFS, { }, '/working');
            FS.chdir('/working');   
            
            FS.writeFile('/home/web_user/.gitconfig', '[user]\n' +
                        'name = Test User\n' +
                        'email = test@example.com');
            resolve(lg);
        };
    })
}
