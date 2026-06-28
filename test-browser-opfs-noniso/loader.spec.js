import { test, expect } from '@playwright/test';

// Verifies the runtime loader (lg2_opfs_auto.js) selects the optimal OPFS build
// for the current browser/context, and that the selected build performs a real
// clone where OPFS is actually usable.
//
// Note: Playwright's headless WebKit does not implement OPFS storage
// (navigator.storage.getDirectory() throws), even though real Safari does. The
// variant *selection* (pure feature detection) is asserted for every browser;
// the functional clone runs only where OPFS storage works.
test('loader selects the optimal OPFS build (and clones where OPFS works)', async ({ page }, testInfo) => {
  const { expectedVariant, isolated } = testInfo.project.metadata;

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  // The page's isolation state must match the project's expectation.
  const pageIsolated = await page.evaluate(() => self.crossOriginIsolated === true);
  expect(pageIsolated, 'page crossOriginIsolated').toBe(isolated);

  // 1) Variant selection — pure detection, works in every browser.
  const selected = await page.evaluate(async () => {
    const { selectOpfsVariant } = await import('/lg2_opfs_auto.js');
    return selectOpfsVariant(globalThis);
  });
  expect(selected, 'loader-selected variant').toBe(expectedVariant);

  // 2) Functional clone — only where OPFS storage is actually available.
  const opfsUsable = await page.evaluate(async () => {
    try { await navigator.storage.getDirectory(); return true; } catch (e) { return false; }
  });
  if (!opfsUsable) {
    testInfo.annotations.push({
      type: 'skip-functional',
      description: 'OPFS storage unavailable in this browser/runtime; selection verified only',
    });
    expect(errors, 'no page errors').toEqual([]);
    return;
  }

  const result = await page.evaluate(async () => {
    const worker = new Worker('/test-browser-opfs-noniso/worker.js', { type: 'module' });
    const once = (pred) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('worker timeout')), 60000);
        worker.onmessage = (e) => {
          if (e.data.error) { clearTimeout(timer); reject(new Error(e.data.error)); return; }
          if (pred(e.data)) { clearTimeout(timer); resolve(e.data); }
        };
        worker.onerror = (e) => { clearTimeout(timer); reject(new Error('worker.onerror: ' + e.message)); };
      });

    worker.postMessage({ command: 'init' }); // auto-detect
    const ready = await once((d) => d.ready);
    worker.postMessage({ command: 'clone', url: location.origin + '/testrepo.git' });
    const cloned = await once((d) => d.dircontents);
    return { ready, dircontents: cloned.dircontents };
  });

  expect(errors, 'no page errors').toEqual([]);
  expect(result.ready.crossOriginIsolated, 'reported crossOriginIsolated').toBe(isolated);
  expect(result.ready.variant, 'selected variant (worker)').toBe(expectedVariant);
  expect(result.dircontents, 'clone produced a .git directory').toContain('.git');
});
