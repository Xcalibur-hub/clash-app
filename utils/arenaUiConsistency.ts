/**
 * Arena UI Phase 6 — shared presentation constants.
 * Keeps Home / Duel / Challenge / Verdict touch and spacing aligned without
 * changing feed, judging, or challenge backend contracts.
 */

import { layout } from '../theme/layout.ts';

/** Minimum accessible control height (Apple HIG / Material ≥44). */
export const ARENA_HIT = layout.hit;

/** Prefer a slightly taller hit for text-only secondary cues on dense Stage. */
export const ARENA_HIT_COMFORT = 48;

/** Bottom inset floor for sheets on compact Android (A50 nav bar). */
export const ARENA_SHEET_BOTTOM_FLOOR = 24;

export function arenaSheetBottomPadding(safeBottom: number): number {
  const safe = Number.isFinite(safeBottom) && safeBottom > 0 ? safeBottom : 0;
  return Math.max(safe, ARENA_SHEET_BOTTOM_FLOOR);
}

export type ArenaLiveChromeKind = 'live' | 'judging' | 'settled' | 'cancelled';

/** Distinct status terminology for live vs judging vs terminal chrome. */
export function arenaLiveChromeKind(input: {
  live: boolean;
  judging?: boolean;
  terminal?: 'settled' | 'cancelled' | null;
}): ArenaLiveChromeKind {
  if (input.terminal === 'cancelled') return 'cancelled';
  if (input.terminal === 'settled') return 'settled';
  if (input.judging) return 'judging';
  if (input.live) return 'live';
  return 'settled';
}

export function arenaLiveStatusLabel(kind: ArenaLiveChromeKind): string {
  switch (kind) {
    case 'live':
      return 'LIVE';
    case 'judging':
      return 'JUDGING';
    case 'cancelled':
      return 'CANCELLED';
    case 'settled':
      return 'SETTLED';
  }
}
