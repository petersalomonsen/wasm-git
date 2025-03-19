Object.assign(Module, globalThis.wasmGitModuleOverrides);

// Add HTTP Basic auth headers
if (Module.username || Module.accessToken) {
    XMLHttpRequest.prototype._open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
        this._open(method, url, async, user, password);
        if (Module.accessToken) {
            const username = Module.username || '';
            this.setRequestHeader('Authorization', `Basic ${btoa(username + ':' + Module.accessToken)}`);
        }
    };
}

if (!Module.print && !Module.printErr) {
    let capturedOutput = null;
    let capturedError = null;
    let quitStatus;

    Module.print = (msg) => {
        if (capturedOutput !== null) {
            capturedOutput.push(msg);
        }
        console.log(msg);
    }

    Module.printErr = (msg) => {
        if (capturedError !== null) {
            capturedError.push(msg);
        }
        console.error(msg);
    }

    Module.quit = (status) => {
        quitStatus = status;
    };

    Module.callWithOutput = (args) => {
        capturedOutput = [];
        capturedError = [];
        quitStatus = null;
        
        Module.callMain(args);
        
        const ret = capturedOutput.join('\n');
        const err = capturedError.join('\n');
        capturedOutput = null;
        capturedError = null;

        if (!quitStatus) {
            return ret;
        } else {
            throw(quitStatus + ': ' + err);
        }
    }
}
