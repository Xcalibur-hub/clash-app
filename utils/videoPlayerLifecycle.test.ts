/**
 * Documents the useVideoPlayer cleanup contract that caused the Android
 * "shared object already released" crash in ArenaStackMedia.
 *
 * useVideoPlayer registers its release cleanup before consumer effects.
 * On unmount React runs those cleanups in registration order — release first.
 * A later cleanup that calls pause()/play() on that player throws.
 *
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  shouldPauseVideoPlayerInEffectCleanup,
  simulatePlayerLifecycle,
} from './videoPlayerLifecycle.ts';

describe('video player effect cleanup contract', () => {
  it('forbids pause during unmount cleanup when useVideoPlayer owns release', () => {
    assert.equal(shouldPauseVideoPlayerInEffectCleanup({ reason: 'unmount' }), false);
  });

  it('allows pause in the effect body when playback should stop while mounted', () => {
    assert.equal(shouldPauseVideoPlayerInEffectCleanup({ reason: 'shouldPlay-false' }), true);
  });

  it('correct cleanup never touches a released player', () => {
    const log = simulatePlayerLifecycle({ pauseInCleanup: false });
    assert.deepEqual(log, ['play', 'release']);
  });

  it('incorrect cleanup pause-after-release throws', () => {
    assert.throws(
      () => simulatePlayerLifecycle({ pauseInCleanup: true }),
      /already released/,
    );
  });

  it('open → play → close → reopen creates a fresh player each session', () => {
    const first = simulatePlayerLifecycle({ pauseInCleanup: false });
    const second = simulatePlayerLifecycle({ pauseInCleanup: false });
    assert.deepEqual(first, ['play', 'release']);
    assert.deepEqual(second, ['play', 'release']);
  });
});
