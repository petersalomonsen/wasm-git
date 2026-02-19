import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testMatch: 'examples/opfs/opfs.spec.js',
    timeout: 90000,
    use: {
        baseURL: 'http://localhost:7778',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'node examples/opfs/serve.mjs',
        url: 'http://localhost:7778/ping',
        reuseExistingServer: false,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
