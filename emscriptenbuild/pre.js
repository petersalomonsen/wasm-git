Object.assign(Module, globalThis.wasmGitModuleOverrides);

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
