import { playwrightLauncher } from '@web/test-runner-playwright';
import { startServer } from './test-browser/githttpserver.js';

startServer();

// Non-isolated counterpart of web-test-runner-opfs.config.js: NO COOP/COEP
// headers, so `self.crossOriginIsolated === false` and SharedArrayBuffer is
// unavailable. This exercises the SAB-free OPFS builds (ASYNCIFY + JSPI).
export default {
  files: [
    // Only the mocha/web-test-runner suite here; loader.spec.js is a Playwright
    // test (run via playwright-opfs-loader.config.js), not a web-test-runner one.
    'test-browser-opfs-noniso/opfs.spec.js',
  ],
  concurrency: 1,
  watch: false,
  testFramework: {
    config: {
      ui: 'bdd',
      timeout: '20000',
    },
  },
  testRunnerHtml: testRunnerImport =>
    `<html>
      <body>
        <script type="module">
            import { expect, assert} from 'https://cdn.jsdelivr.net/npm/chai@5.0.0/+esm';
            globalThis.assert = assert;
            globalThis.expect = expect;
        </script>
        <script type="module" src="${testRunnerImport}"></script>
      </body>
    </html>`,
  browsers: [
    playwrightLauncher({ product: 'chromium', createBrowserContext: async ({ browser }) => {
      const ctx = await browser.newContext({});
      await ctx.route(/http:\/\/localhost:8000\/.*\.git\/.*/, async (route) => {
        const url = route.request().url();
        const response = await route.fetch({url: url.replace(':8000/', ':8080/')});
        const body = await response.body();
        await route.fulfill({ body });
      });
      return ctx;
    }, }),
  ],
};
