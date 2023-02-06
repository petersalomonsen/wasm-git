importScripts('lg2.js');

Module.onRuntimeInitialized = () => {

    FS.mkdir('/working');
    FS.mount(MEMFS, { }, '/working');

    FS.writeFile('/home/web_user/.gitconfig', '[user]\n' +
                'name = Test User\n' +
                'email = test@example.com');

    // Allocate memory of 8 bytes for pointer (probably 4 would be enough)
    let repoPointer = Module._malloc(8);

    // int git_repository_init(git_repository **out, const char *path, unsigned int is_bare);
    let git_repository_init = Module.cwrap('git_repository_init', 'number', ['number','string','number'])

    debugger
    let r1 = git_repository_init(repoPointer, ".", 0)
    console.log(`r1 ${r1}`);

};