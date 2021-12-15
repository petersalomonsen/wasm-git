/**
 * Javascript functions for emscripten http transport for nodejs and the browser NOT using a webworker
 * 
 * If you can't use a webworker, you can build Release-async or Debug-async versions of wasm-git
 * which use async transports, and can be run without a webworker. The lg2 release files are about
 * twice the size with this option, and your UI may be affected by doing git operations in the
 * main JavaScript thread.
 * 
 * This the non-webworker version (see also post.js)
 */

const emscriptenhttpconnections = {};
let httpConnectionNo = 0;

const chmod = FS.chmod;
    
FS.chmod = function(path, mode, dontFollow) { 
    if (mode === 0o100000 > 0) {
        // workaround for libgit2 calling chmod with only S_IFREG set (permisions 0000)
        // reason currently not known
        return chmod(path, mode, dontFollow);
    } else {
        return 0;
    }
};

if(ENVIRONMENT_IS_WEB) {
    Module.origCallMain = Module.callMain;
    Module.callMain = async (args) => {
        await Module.origCallMain(args);
        if (typeof Asyncify === 'object' && Asyncify.currData) {            
            await Asyncify.whenDone();
        }
    };

    Object.assign(Module, {
        emscriptenhttpconnect: async function(url, buffersize, method, headers) {
          let result = new Promise((resolve, reject) => {
            if(!method) {
              method = 'GET';
            }

            const xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.responseType = 'arraybuffer';

            if (headers) {
                Object.keys(headers).forEach(header => xhr.setRequestHeader(header, headers[header]));
            }

            emscriptenhttpconnections[httpConnectionNo] = {
                xhr: xhr,
                resultbufferpointer: 0,
                buffersize: buffersize
            };
            
            if(method === 'GET') {
              xhr.onload = function () {
                resolve(httpConnectionNo++);
              };
              xhr.send();
            } else {
              resolve(httpConnectionNo++);
            }
          });
          return result;
        },
        emscriptenhttpwrite: function(connectionNo, buffer, length) {
            const connection = emscriptenhttpconnections[connectionNo];
            const buf = new Uint8Array(Module.HEAPU8.buffer,buffer,length).slice(0);
            if(!connection.content) {
                connection.content = buf;
            } else {
                const content = new Uint8Array(connection.content.length + buf.length);
                content.set(connection.content);
                content.set(buf, connection.content.length);
                connection.content = content;
            }            
        },
        emscriptenhttpread: async function(connectionNo, buffer, buffersize) {
          const connection = emscriptenhttpconnections[connectionNo];

          function handleResponse(connection, buffer, buffersize) {
            let bytes_read = connection.xhr.response.byteLength - connection.resultbufferpointer;
            if (bytes_read > buffersize) {
              bytes_read = buffersize;
            }
            const responseChunk = new Uint8Array(connection.xhr.response, connection.resultbufferpointer, bytes_read);
            writeArrayToMemory(responseChunk, buffer);
            connection.resultbufferpointer += bytes_read;
            return bytes_read;
          }

          let result = new Promise((resolve) => {
              if(connection.content) {
                    connection.xhr.onload = function () {
                    resolve(handleResponse(connection, buffer, buffersize));
                };
                connection.xhr.send(connection.content.buffer);
                connection.content = null;
              } else {
                resolve(handleResponse(connection, buffer, buffersize));
              }
          });

          return result;
        },
        emscriptenhttpfree: function(connectionNo) {
            delete emscriptenhttpconnections[connectionNo];
        }
    });
} else if(ENVIRONMENT_IS_NODE) {
    const { Worker } = require('worker_threads');

    Object.assign(Module, {
        emscriptenhttpconnect: function(url, buffersize, method, headers) {
            const statusArray = new Int32Array(new SharedArrayBuffer(4));
            Atomics.store(statusArray, 0, method === 'POST' ? -1 : 0);
        
            const resultBuffer = new SharedArrayBuffer(buffersize);
            const resultArray = new Uint8Array(resultBuffer);
            const workerData =  {
                    statusArray: statusArray,
                    resultArray: resultArray,
                    url: url,
                    method: method ? method: 'GET',
                    headers: headers
            };  

            new Worker('(' + (function requestWorker() {
                const { workerData } = require('worker_threads');
                const req = require(workerData.url.indexOf('https') === 0 ? 'https' : 'http')
                              .request(workerData.url, {
                    headers: workerData.headers,
                    method: workerData.method
                }, (res) => {
                    res.on('data', chunk => {
                        const previousStatus = workerData.statusArray[0];
                        if(previousStatus !== 0) {
                            Atomics.wait(workerData.statusArray, 0, previousStatus);
                        }                    
                        workerData.resultArray.set(chunk);                    
                        Atomics.store(workerData.statusArray, 0, chunk.length);
                        Atomics.notify(workerData.statusArray, 0, 1);
                    });
                });        

                if(workerData.method === 'POST') {
                    while(workerData.statusArray[0] !== 0) {
                        Atomics.wait(workerData.statusArray, 0, -1);
                        const length = workerData.statusArray[0];
                        if(length === 0) {
                            break;
                        }
                        req.write(Buffer.from(workerData.resultArray.slice(0, length)));
                        Atomics.store(workerData.statusArray, 0, -1);
                        Atomics.notify(workerData.statusArray, 0, 1);
                    }
                }
                
                req.end();
            }).toString()+')()' , {
                eval: true,
                workerData: workerData
            }); 
            emscriptenhttpconnections[httpConnectionNo] = workerData;
            console.log('connected with method', workerData.method, 'to', workerData.url);
            return httpConnectionNo++;
        },
        emscriptenhttpwrite: function(connectionNo, buffer, length) {
            const connection = emscriptenhttpconnections[connectionNo];
            connection.resultArray.set(new Uint8Array(Module.HEAPU8.buffer,buffer,length));
            Atomics.store(connection.statusArray, 0, length);
            Atomics.notify(connection.statusArray, 0, 1);
            // Wait for write to finish
            Atomics.wait(connection.statusArray, 0, length);
        },
        emscriptenhttpread: function(connectionNo, buffer) { 
            const connection = emscriptenhttpconnections[connectionNo];

            if(connection.statusArray[0] === -1 && connection.method === 'POST') {
                // Stop writing
                Atomics.store(connection.statusArray, 0, 0);
                Atomics.notify(connection.statusArray, 0, 1);
            }
            Atomics.wait(connection.statusArray, 0, 0);
            const bytes_read = connection.statusArray[0];

            writeArrayToMemory(connection.resultArray.slice(0, bytes_read), buffer);

            //console.log('read with connectionNo', connectionNo, 'length', bytes_read, 'content',
            //        new TextDecoder('utf-8').decode(connection.resultArray.slice(0, bytes_read)));
            Atomics.store(connection.statusArray, 0, 0);
            Atomics.notify(connection.statusArray, 0, 1);

            return bytes_read;
        },
        emscriptenhttpfree: function(connectionNo) {
            delete emscriptenhttpconnections[connectionNo];
        }
    });
}