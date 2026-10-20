/**
 * Reaction state transitions for the room hook.
 *
 * Pure so the race conditions can be tested without a renderer:
 * - optimistic toggles never change an authoritative total;
 * - a response is accepted only if it belongs to the newest tap on that message;
 * - a rejection restores exactly the rows that were replaced.
 */
import type { ArenaReaction } from '../services/liveArenaService';

export interface ReactionResult {
  messageId: string;
  emoji: string;
  reacted: boolean;
  count: number;
}

/**
 * Flip the viewer's own selection immediately. A previously unseen emoji is
 * added with a zero total so no number is rendered before the server answers.
 */
export function applyOptimisticReaction(
  rows: readonly ArenaReaction[],
  emoji: string,
): ArenaReaction[] {
  if (!emoji) return [...rows];
  const existing = rows.some((row) => row.emoji === emoji);
  const next = existing
    ? rows.map((row) => (row.emoji === emoji ? { ...row, viewerReacted: !row.viewerReacted } : row))
    : [...rows, { emoji, count: 0, viewerReacted: true }];
  return sortReactions(next);
}

/** Replace one emoji with the server's authoritative count and selection. */
export function mergeReactionResult(
  rows: readonly ArenaReaction[],
  result: Pick<ReactionResult, 'emoji' | 'count' | 'reacted'>,
): ArenaReaction[] {
  const others = rows.filter((row) => row.emoji !== result.emoji);
  const next = result.count > 0
    ? [...others, { emoji: result.emoji, count: result.count, viewerReacted: result.reacted }]
    : others;
  return sortReactions(next);
}

/** Only the newest tap for a message may commit its response. */
export function reactionSequenceAccepted(latest: number | undefined, mine: number): boolean {
  return latest === mine;
}

/** Restore the exact pre-tap rows (order preserved) after a rejected request. */
export function restoreReactions(prior: readonly ArenaReaction[] | null): ArenaReaction[] | null {
  return prior ? [...prior] : null;
}

function sortReactions(rows: readonly ArenaReaction[]): ArenaReaction[] {
  return [...rows].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}
