import { defineConfig, devices } from '@playwright/test';

// Multi-browser test that the runtime loader (lg2_opfs_auto.js) selects the
// optimal OPFS build per browser/context and that the selected build works.
//
// Coverage matrix:
//   chromium-isolated (COOP/COEP, :7780) → pthreads (lg2_opfs),     isolated=true
//   chromium          (no COOP/COEP, :7781) → jspi  (lg2_opfs_jspi), isolated=false
//   firefox           (no COOP/COEP, :7781) → jspi  (lg2_opfs_jspi), isolated=false
//   webkit            (no COOP/COEP, :7781) → jspi  (lg2_opfs_jspi), isolated=false
//
// Firefox and WebKit shipped JSPI (WebAssembly.Suspending/promising) after this
// suite was written, so they now select the JSPI build too. Engines without it
// must still land on ASYNCIFY, which `variantWithoutJspi` expresses.
export default defineConfig({
  testMatch: 'test-browser-opfs-noniso/loader.spec.js',
  timeout: 120000,
  workers: 1,
  projects: [
    {
      name: 'chromium-isolated',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:7780',
      },
      metadata: { expectedVariant: 'pthreads', isolated: true },
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:7781',
        launchOptions: {
          args: [
            '--enable-experimental-webassembly-features',
            '--js-flags=--experimental-wasm-jspi',
          ],
        },
      },
      metadata: { expectedVariant: 'jspi', isolated: false },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], baseURL: 'http://localhost:7781' },
      metadata: { expectedVariant: 'jspi', variantWithoutJspi: 'asyncify', isolated: false },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], baseURL: 'http://localhost:7781' },
      metadata: { expectedVariant: 'jspi', variantWithoutJspi: 'asyncify', isolated: false },
    },
  ],
  webServer: {
    command: 'node test-browser-opfs-noniso/serve-loader.mjs',
    url: 'http://localhost:7781/ping',
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
