/**
 * Pure helpers documenting expo-video + useVideoPlayer cleanup ownership.
 * No RN / native modules — unit-testable contract only.
 */

export type VideoCleanupReason = 'unmount' | 'shouldPlay-false';

/**
 * Whether an effect cleanup (or body) should call pause on a player owned by
 * `useVideoPlayer`.
 *
 * - `unmount`: never — the hook releases first; pause then crashes.
 * - `shouldPlay-false`: yes, from the *next* effect body while still mounted.
 */
export function shouldPauseVideoPlayerInEffectCleanup(options: {
  reason: VideoCleanupReason;
}): boolean {
  return options.reason === 'shouldPlay-false';
}

/**
 * Simulates registration-order teardown: useVideoPlayer release runs before
 * a consumer cleanup. Optional pauseInCleanup mirrors the old ArenaStackMedia bug.
 */
export function simulatePlayerLifecycle(options: {
  pauseInCleanup: boolean;
}): string[] {
  const log: string[] = [];
  let released = false;

  const player = {
    play(): void {
      if (released) throw new Error('already released');
      log.push('play');
    },
    pause(): void {
      if (released) throw new Error('already released');
      log.push('pause');
    },
    release(): void {
      released = true;
      log.push('release');
    },
  };

  // Session: play while mounted
  player.play();

  // Unmount: hook release first (registration order), then consumer cleanup
  player.release();
  if (options.pauseInCleanup) {
    player.pause();
  }

  return log;
}
