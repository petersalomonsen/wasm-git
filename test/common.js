module.exports = {
    lgPromise: new Promise(resolve => {
        const lg = require('./lg2.js');
        lg.onRuntimeInitialized = () => {
            const FS = lg.FS;
            
            resolve(lg);
        };
    })
}
