describe('wasm-git', function() {
    this.timeout(20000);

    it('should have window', () => {
        assert(window !== undefined);
    });

    let lg, FS;
    before(async () => {
        const lgMod = await import(new URL('lg2_async.js', import.meta.url));
        lg = await lgMod.default();
        FS = lg.FS;
    });

    let APPFS;
    it('should create an in memory filesystem, APPFS', () => {
        APPFS = FS.filesystems.MEMFS;
        assert(typeof(APPFS) === 'object' );
    });
    
    it('should make a working directory', () => {
        FS.mkdir(workingDir);
    });
    
    it('should mount the filesystem on the working directory', () => {
        FS.mount(APPFS, { root: '.' }, workingDir);
    });
    
    it('should make a directory and mount a memory filesystem on it', () => {
        FS.chdir(workingDir);    
    });
    
    it('should write a .gitconfig file', () => {
        FS.writeFile('/home/web_user/.gitconfig', '[user]\n' +
                    'name = Test User\n' +
                    'email = test@example.com');
    });

    it('should ping the gitserver', async () => {
        const result = await fetch('/testrepo.git/ping').then(res => res.text());
        assert(result === 'pong');
    });

    let workingDir, url, currentRepoRootDir, testFile, testContents;
    beforeEach(() => {
        workingDir = "/working";
        url = `${location.origin}/testrepo.git`;
        currentRepoRootDir = url.substring(url.lastIndexOf('/') + 1);
        testFile = "test.txt";
        testContents = "hello-world!";
    });

    it('should clone a bare repository and push commits', async () => {
        console.log(`git clone ${url}`);
        await lg.callMain(['clone', url, currentRepoRootDir]);
        FS.chdir(currentRepoRootDir);

        let dircontents = FS.readdir('.');
        console.log(dircontents);
        assert(dircontents.length > 2);
        assert(dircontents.find(entry => entry === '.git'));

        FS.writeFile(testFile, testContents);
        await lg.callMain(['add', '--verbose', testFile]);
        await lg.callMain(['commit','-m', `edited ${testFile}`]);
        await lg.callMain(['push']);

        dircontents = FS.readdir('.');
        console.log(dircontents);
        assert(dircontents.length > 2);
        assert(dircontents.find(entry => entry === testFile));
    });

    it('rename the local clone of the repository', async () => {
        FS.chdir(workingDir);
        FS.rename(currentRepoRootDir, 'junk');
        const dircontents = FS.readdir('.');
        assert(dircontents.find(entry => entry !== currentRepoRootDir));
        console.log(`renamed ${currentRepoRootDir}`);
    });

    it('should clone the repository with contents', async () => {
        let dircontents = FS.readdir('.');
        assert(dircontents.find(entry => entry !== testFile));

        await lg.callMain(['clone', url, currentRepoRootDir]);
        dircontents = FS.readdir(currentRepoRootDir);
        assert(dircontents.length > 2);
        assert(dircontents.find(entry => entry === '.git'));
        assert(dircontents.find(entry => entry === testFile));

        console.log(`${currentRepoRootDir}/${testFile}`)
        const filecontents = FS.readFile(`${currentRepoRootDir}/${testFile}`, {encoding: 'utf8'});
        console.log('contents:', filecontents);
        assert(String(filecontents) === testContents);
    });
});