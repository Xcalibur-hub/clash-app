/**
 * Arena For You FlatList surface rules (UI only).
 * Preserves side-nav modes: only For You owns the Take list.
 */
import type { ArenaMode } from './arenaNav';

export type ArenaLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export function isArenaFeedMode(mode: ArenaMode): boolean {
  return mode === 'for_you';
}

/**
 * Rows for the Arena FlatList.
 * Non-For-You modes stay header-only (empty data) — do not dump Takes under Clashes/etc.
 * Loading/error clear rows so ListEmptyComponent / header status can own the slot.
 */
export function arenaFlatListData<T>(
  mode: ArenaMode,
  arenaStatus: ArenaLoadStatus,
  listFeed: readonly T[],
): readonly T[] {
  if (!isArenaFeedMode(mode)) return [];
  if (arenaStatus === 'loading' || arenaStatus === 'error') return [];
  return listFeed;
}

/**
 * Whether the FlatList empty slot should render.
 * Ready + Fresh Takes already populated must NOT show a false "No live takes"
 * just because listFeed was emptied by the Fresh Takes slice.
 */
export function shouldShowArenaFeedEmpty(
  mode: ArenaMode,
  arenaStatus: ArenaLoadStatus,
  feedCount: number,
): boolean {
  if (!isArenaFeedMode(mode)) return false;
  if (arenaStatus === 'loading' || arenaStatus === 'error') return true;
  return feedCount === 0;
}

/** Cold-start / hung network: resolve hydration so the UI never spins forever. */
export const ARENA_HYDRATION_TIMEOUT_MS = 12_000;

export function arenaHydrationTimeoutMessage(): string {
  return "Couldn't load Arena.";
}
