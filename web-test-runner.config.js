import { playwrightLauncher } from '@web/test-runner-playwright';
import { startServer } from './test-browser/githttpserver.js';

startServer();

export default {
  files: [
    '**/*.spec.js', // include `.spec.ts` files
    '!./node_modules/**/*', // exclude any node modules
  ],
  concurrency: 1,
  watch: false,
  testFramework: {
    config: {
      ui: 'bdd',
      timeout: '5000',
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
    /*playwrightLauncher({
      product: 'firefox', launchOptions: {
        headless: false,
        firefoxUserPrefs: {
          'media.autoplay.block-webaudio': false
        }
      }
    }),*/
    /*playwrightLauncher({
      product: 'webkit',launchOptions: {
        headless: false
      }
    })*/
  ],
};
