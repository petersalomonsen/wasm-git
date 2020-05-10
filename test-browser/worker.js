var Module = {    
    'print': function(text) {
      
      console.log(text);
      postMessage({'stdout': text});
    },
    'printErr': function(text) {
      
      console.error(text);
      postMessage({'stderr': text});
    }
};

importScripts('lg2.js');

Module.onRuntimeInitialized = () => {
    const lg = Module;

    FS.writeFile('/home/web_user/.gitconfig', '[user]\n' +
                'name = Test User\n' +
                'email = test@example.com');

    let currentRepoRootDir;

    onmessage = (msg) => {
      if (msg.data.command === 'writecommitandpush') {
        FS.writeFile(msg.data.filename, msg.data.contents);
        lg.callMain(['add', '--verbose', msg.data.filename]);
        lg.callMain(['commit','-m', `edited ${msg.data.filename}`]);
        FS.syncfs(false, () => {
          console.log(currentRepoRootDir, 'stored to indexeddb');
          lg.callMain(['push']);
          postMessage({ dircontents: FS.readdir('.') });
        });        
      } else if (msg.data.command === 'synclocal') {
        currentRepoRootDir = msg.data.url.substring(msg.data.url.lastIndexOf('/') + 1);
        console.log('synclocal', currentRepoRootDir);

        FS.mkdir(`/${currentRepoRootDir}`);
        FS.mount(IDBFS, { }, `/${currentRepoRootDir}`);
        
        FS.syncfs(true, () => {
          
          if( FS.readdir(`/${currentRepoRootDir}`).find(file => file === '.git') ) {
            FS.chdir( `/${currentRepoRootDir}` );
            postMessage({ dircontents: FS.readdir('.') });
            console.log(currentRepoRootDir, 'restored from indexeddb');
          } else {
            FS.chdir( '/' );
            postMessage('no git repo in ' + currentRepoRootDir);
            postMessage({ notfound: true });
          }
        });
      } else if (msg.data.command === 'deletelocal') {
        postMessage('deleting database ' + currentRepoRootDir);
        FS.unmount(`/${currentRepoRootDir}`);
        postMessage('unmount done');
        self.indexedDB.deleteDatabase('/' + currentRepoRootDir);
        postMessage('deleted from indexeddb');
        postMessage({ deleted: currentRepoRootDir});
      } else if (msg.data.command === 'clone') {
        currentRepoRootDir = msg.data.url.substring(msg.data.url.lastIndexOf('/') + 1);
        
        postMessage({stdout: `git clone ${msg.data.url}`});
        lg.callMain(['clone', msg.data.url, currentRepoRootDir]);
        FS.chdir(currentRepoRootDir);

        FS.syncfs(false, () => {
          console.log(currentRepoRootDir, 'stored to indexeddb');
        });
        postMessage({ dircontents: FS.readdir('.') });
      } else if (msg.data.command === 'pull') {
        lg.callMain(['fetch', 'origin']);
        lg.callMain(['merge', 'origin/master']);
        FS.syncfs(false, () => {
          console.log(currentRepoRootDir, 'stored to indexeddb');
        });
      } else if (msg.data.command === 'readfile') {
        try {
          postMessage({
            filename: msg.data.filename,
            filecontents: FS.readFile(msg.data.filename, {encoding: 'utf8'})
          });
        } catch (e) {
          postMessage({'stderr': JSON.stringify(e)});
        }
      } else {
        lg.callMain([msg.data.command]);
      }
    };

    postMessage({'ready': true});
};