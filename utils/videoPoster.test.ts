import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Mirrors services/videoPoster.ts frame selection without importing Expo native
 * modules in the Node unit runner.
 */
function posterTimeMs(durationMs: number | null | undefined): number {
  if (durationMs == null || durationMs <= 0) return 1000;
  const preferred = Math.min(1500, Math.max(500, Math.floor(durationMs * 0.12)));
  return Math.min(preferred, Math.max(0, durationMs - 80));
}

describe('video poster frame selection', () => {
  it('defaults to ~1s when duration is unknown', () => {
    assert.equal(posterTimeMs(null), 1000);
    assert.equal(posterTimeMs(undefined), 1000);
    assert.equal(posterTimeMs(0), 1000);
  });

  it('stays inside the 0.5–1.5s window for typical clips', () => {
    const t = posterTimeMs(12_000);
    assert.ok(t >= 500 && t <= 1500);
  });

  it('never seeks past the end of a short clip', () => {
    assert.equal(posterTimeMs(400), 320);
  });
});
