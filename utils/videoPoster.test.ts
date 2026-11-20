import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Mirrors services/videoPoster.ts frame selection without importing Expo native
 * modules in the Node unit runner.
 */
function posterTimeMs(durationMs: number | null | undefined): number {
  const preferred = 1000;
  if (durationMs == null || durationMs <= 0) return preferred;
  const maxSafe = Math.max(0, durationMs - 80);
  return Math.min(preferred, maxSafe);
}

describe('video poster frame selection', () => {
  it('defaults to 1000ms when duration is unknown', () => {
    assert.equal(posterTimeMs(null), 1000);
    assert.equal(posterTimeMs(undefined), 1000);
    assert.equal(posterTimeMs(0), 1000);
  });

  it('uses 1000ms for typical clips', () => {
    assert.equal(posterTimeMs(12_000), 1000);
  });

  it('never seeks past the end of a short clip', () => {
    assert.equal(posterTimeMs(400), 320);
  });
});
