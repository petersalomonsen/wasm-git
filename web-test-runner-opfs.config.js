import { playwrightLauncher } from '@web/test-runner-playwright';
import { startServer } from './test-browser/githttpserver.js';

startServer();

export default {
  files: [
    'test-browser-opfs/**/*.spec.js',
  ],
  concurrency: 1,
  watch: false,
  testFramework: {
    config: {
      ui: 'bdd',
      timeout: '5000',
    },
  },
  middleware: [
    function setCrossOriginIsolationHeaders(context, next) {
      // Required for SharedArrayBuffer (pthreads)
      context.set('Cross-Origin-Opener-Policy', 'same-origin');
      context.set('Cross-Origin-Embedder-Policy', 'credentialless');
      return next();
    }
  ],
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
