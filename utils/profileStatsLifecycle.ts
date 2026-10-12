/**
 * Helpers for profile Clash stats / Wins surfaces: discard stale async work,
 * clear owned state on account change, and filter settled wins.
 */

export function isCurrentRequest(
  active: boolean,
  requestId: number,
  latestId: number,
): boolean {
  return active && requestId === latestId;
}

/** True when owned list/facet state was loaded for a different account. */
export function ownedStateIsStale(
  loadedForId: string | null | undefined,
  viewerId: string,
): boolean {
  if (loadedForId == null) return true;
  return loadedForId !== viewerId;
}

export function filterSettledWins<T extends { outcome: 'won' | 'lost' | 'draw' | null }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => row.outcome === 'won');
}
