/**
 * Unit tests for the OPFS variant detection / selection logic in
 * lg2_opfs_auto.js. These are pure functions that take an `env` object, so we
 * can force any combination of capabilities without a browser.
 */
import { assert } from 'chai';
import { detectOpfsEnvironment, selectOpfsVariant } from '../lg2_opfs_auto.js';

// Build a fake environment with the given capabilities.
function env({ opfs = true, isolated = false, sab = false, jspi = false } = {}) {
  return {
    navigator: opfs ? { storage: { getDirectory: () => {} } } : {},
    crossOriginIsolated: isolated,
    SharedArrayBuffer: sab ? function () {} : undefined,
    WebAssembly: jspi ? { Suspending: function () {}, promising: function () {} } : {},
  };
}

describe('OPFS detection', () => {
  it('detects OPFS availability', () => {
    assert.isTrue(detectOpfsEnvironment(env({ opfs: true })).opfsAvailable);
    assert.isFalse(detectOpfsEnvironment(env({ opfs: false })).opfsAvailable);
  });

  it('only reports cross-origin isolation when SharedArrayBuffer exists too', () => {
    assert.isFalse(detectOpfsEnvironment(env({ isolated: true, sab: false })).crossOriginIsolated);
    assert.isTrue(detectOpfsEnvironment(env({ isolated: true, sab: true })).crossOriginIsolated);
  });

  it('detects JSPI from WebAssembly.Suspending / promising', () => {
    assert.isTrue(detectOpfsEnvironment(env({ jspi: true })).jspiAvailable);
    assert.isFalse(detectOpfsEnvironment(env({ jspi: false })).jspiAvailable);
  });
});

describe('OPFS variant selection', () => {
  it('returns null when OPFS is unavailable (caller falls back to IDBFS)', () => {
    assert.isNull(selectOpfsVariant(env({ opfs: false, isolated: true, sab: true, jspi: true })));
  });

  it('prefers pthreads when cross-origin isolated', () => {
    assert.equal(selectOpfsVariant(env({ isolated: true, sab: true, jspi: true })), 'pthreads');
  });

  it('prefers JSPI when not isolated but JSPI is available', () => {
    assert.equal(selectOpfsVariant(env({ isolated: false, jspi: true })), 'jspi');
  });

  it('falls back to ASYNCIFY when neither isolation nor JSPI is available', () => {
    assert.equal(selectOpfsVariant(env({ isolated: false, jspi: false })), 'asyncify');
  });

  it('does not pick pthreads when isolated flag is set but SharedArrayBuffer is missing', () => {
    // e.g. a context that claims isolation but lacks SAB → must not pick pthreads
    assert.equal(selectOpfsVariant(env({ isolated: true, sab: false, jspi: true })), 'jspi');
    assert.equal(selectOpfsVariant(env({ isolated: true, sab: false, jspi: false })), 'asyncify');
  });
});
