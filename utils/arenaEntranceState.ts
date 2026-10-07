/**
 * Session-scoped Arena entrance gate.
 * Plays when entering Arena from another realm (or cold start), not on every focus.
 */

let pendingEntrance = true;

/** Call when leaving Arena for another primary realm (e.g. Vault). */
export function requestArenaEntrance(): void {
  pendingEntrance = true;
}

/** Returns true once; subsequent focuses within Arena skip the cinematic. */
export function consumeArenaEntrance(): boolean {
  if (!pendingEntrance) return false;
  pendingEntrance = false;
  return true;
}

/** Test/dev helper — does not write production data. */
export function peekArenaEntrancePending(): boolean {
  return pendingEntrance;
}

/** Test helper to reset session gate. */
export function resetArenaEntranceForTests(): void {
  pendingEntrance = true;
}
