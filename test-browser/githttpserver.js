/**
 * This example will create a git http server to repositories on your local disk.
 * Set the GIT_PROJECT_ROOT environment variable to point to location of your git repositories.
 */
const fs = require('fs');
fs.writeFileSync('log.txt', '');
console.log = (...msg) => fs.appendFileSync('log.txt', `${msg.join('\t')}\n`);

function startServer() {
    const http = require('http');
    const cgi = require('cgi');

    const { tmpdir } = require('os');
    const { execSync } = require('child_process');

    execSync(`git init --bare ${tmpdir()}/testrepo.git`);

    const script = 'git';

    const gitcgi = cgi(script, {
        args: ['http-backend'],
        stderr: process.stderr,
        env: {
            'GIT_PROJECT_ROOT': tmpdir(),
            'GIT_HTTP_EXPORT_ALL': '1',
            'REMOTE_USER': 'test@example.com' // Push requires authenticated users by default
        }
    });

    return http.createServer((request, response) => {
        let path = request.url.substring(1);

        console.log('git http server request', request.url, request.method);

        if (path.indexOf('ping') > -1) {
            response.statusCode = 200;
            response.end('pong');
        } else if (path.indexOf('git-upload') > -1 && request.method === 'GET') {
            response.end("001e# service=git-upload-pack\n00000000\n");
        } else if (path.indexOf('git-receive') > -1 && request.method === 'GET') {

            response.end('009f0000000000000000000000000000000000000000\n0000');
        } else {
            response.statusCode = 404;
            response.end('not found');
        }
    }).listen(5000);
}

module.exports = {
    startServer: startServer
}