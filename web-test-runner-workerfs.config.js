import { playwrightLauncher } from '@web/test-runner-playwright';

export default {
  files: [
    'test-browser-workerfs/**/*.spec.js',
    '!./node_modules/**/*',
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
    playwrightLauncher({ product: 'chromium' }),
  ],
};
