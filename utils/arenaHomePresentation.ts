/**
 * Arena Home / Fresh Takes presentation rules (UI Phase 4).
 * Pure layout helpers — no feed ranking, no server reads.
 */

/** Compact Android (A50-class) vs roomier Fresh Takes stage heights. */
export const ARENA_FRESH_STAGE_HEIGHT = {
  compact: 360,
  regular: 400,
} as const;

/** Width below which the Fresh Takes stage uses the compact height. */
export const ARENA_FRESH_STAGE_COMPACT_WIDTH = 380;

export function arenaFreshStageHeight(width: number): number {
  const safe = Number.isFinite(width) && width > 0 ? width : 360;
  return safe < ARENA_FRESH_STAGE_COMPACT_WIDTH
    ? ARENA_FRESH_STAGE_HEIGHT.compact
    : ARENA_FRESH_STAGE_HEIGHT.regular;
}

/**
 * First-viewport stack order for For You Home.
 * Live entry stays visible without burying the primary Take feed.
 */
export const ARENA_HOME_FIRST_VIEWPORT = [
  'live_gateway',
  'fresh_takes',
  'feed_scopes',
  'take_feed',
] as const;

export type ArenaHomeFirstViewportSlot = (typeof ARENA_HOME_FIRST_VIEWPORT)[number];

/** Live gateway copy — never invents counts; null means unknown / loading. */
export function arenaLiveGatewayCopy(liveCount: number | null): {
  title: string;
  subtitle: string;
  live: boolean;
} {
  if (liveCount !== null && liveCount > 0) {
    return {
      title: 'Live Clashes',
      subtitle: `${liveCount} live ${liveCount === 1 ? 'discussion' : 'discussions'} · tap to watch`,
      live: true,
    };
  }
  return {
    title: 'Find a debate',
    subtitle: 'Browse open Clashes and topic rooms',
    live: false,
  };
}
