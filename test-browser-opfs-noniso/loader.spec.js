import { test, expect } from '@playwright/test';

// Verifies the runtime loader (lg2_opfs_auto.js) selects the optimal OPFS build
// for the current browser/context, and that the selected build performs a real
// clone where OPFS is actually usable.
//
// Note on WebKit: Playwright's headless WebKit does not implement OPFS at all
// (on Linux `navigator.storage.getDirectory` is missing; on macOS it exists but
// throws when called), even though real Safari supports OPFS. So for WebKit we
// only assert that the loader *correctly* reports the situation:
//   - OPFS detected  → 'asyncify' (WebKit has no JSPI)
//   - OPFS missing   → null       (loader signals the IDBFS fallback)
// The functional clone runs only where OPFS storage actually works.
test('loader selects the optimal OPFS build (and clones where OPFS works)', async ({ page }, testInfo) => {
  const { expectedVariant, isolated } = testInfo.project.metadata;

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  // The page's isolation state must match the project's expectation.
  const pageIsolated = await page.evaluate(() => self.crossOriginIsolated === true);
  expect(pageIsolated, 'page crossOriginIsolated').toBe(isolated);

  // Detect capabilities and the loader's selection (pure feature detection).
  const { detected, selected } = await page.evaluate(async () => {
    const { detectOpfsEnvironment, selectOpfsVariant } = await import('/lg2_opfs_auto.js');
    return { detected: detectOpfsEnvironment(globalThis), selected: selectOpfsVariant(globalThis) };
  });

  // 1) Variant selection.
  if (!detected.opfsAvailable) {
    // OPFS entirely unavailable (e.g. Playwright Linux WebKit): the loader must
    // return null so the caller falls back to the IDBFS build.
    expect(selected, 'no-OPFS → null (IDBFS fallback)').toBeNull();
    testInfo.annotations.push({
      type: 'skip-functional',
      description: 'OPFS unavailable in this runtime; loader correctly returns null (IDBFS fallback)',
    });
    expect(errors, 'no page errors').toEqual([]);
    return;
  }
  expect(selected, 'loader-selected variant').toBe(expectedVariant);

  // 2) Functional clone — only where OPFS storage is actually usable.
  const opfsUsable = await page.evaluate(async () => {
    try { await navigator.storage.getDirectory(); return true; } catch (e) { return false; }
  });
  if (!opfsUsable) {
    testInfo.annotations.push({
      type: 'skip-functional',
      description: 'OPFS storage present but not usable in this runtime; selection verified only',
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
