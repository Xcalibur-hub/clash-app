/**
 * Session-scoped registry for one-shot motion moments.
 *
 * Entrance and verdict sequences must play once per canonical moment, not once
 * per mount: returning to a settled room should not replay a celebration or a
 * haptic. Keys are explicit strings so callers own the identity.
 */
const played = new Set<string>();

/** True the first time a key is seen; marks it immediately so concurrent mounts cannot double-play. */
export function shouldPlayOnce(key: string): boolean {
  if (!key || played.has(key)) return false;
  played.add(key);
  return true;
}

export function hasPlayed(key: string): boolean {
  return played.has(key);
}

/** Mark a moment as played without claiming it (used after a one-shot began). */
export function markPlayed(key: string): void {
  if (key) played.add(key);
}

/** Test-only reset; production never clears the session. */
export function resetPlayedOnce(): void {
  played.clear();
}
