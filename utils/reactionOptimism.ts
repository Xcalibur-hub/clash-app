/**
 * Reaction state transitions for the room hook.
 *
 * Pure so the race conditions can be tested without a renderer:
 * - optimistic toggles never change an authoritative total;
 * - mutations for one message run in order; different messages stay independent;
 * - ambiguous failures are repaired by targeted authoritative reads.
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

/** Serialize toggle RPCs: a toggle must never be automatically retried. */
export function createReactionQueue(io: {
  read: (id: string) => Promise<readonly ArenaReaction[] | null>;
  toggle: (id: string, emoji: string) => Promise<ReactionResult>;
  write: (id: string, rows: ArenaReaction[] | null) => void;
  onError: (error: unknown) => void;
}) {
  const tails = new Map<string, Promise<void>>();
  const dirty = new Map<string, () => boolean>();
  const repair = async (id: string, active: () => boolean): Promise<void> => {
    const rows = await io.read(id);
    if (!active()) return;
    io.write(id, rows ? [...rows] : null);
    if (!rows) dirty.delete(id);
  };
  return {
    enqueue(id: string, emoji: string, active: () => boolean): Promise<void> {
      const run = async () => {
        if (!active()) return;
        let baseline: readonly ArenaReaction[] | null = null;
        try {
          baseline = await io.read(id);
          if (!active()) return;
          if (!baseline) { io.write(id, null); dirty.delete(id); return; }
          io.write(id, applyOptimisticReaction(baseline, emoji));
          const result = await io.toggle(id, emoji);
          if (!active()) return;
          io.write(id, mergeReactionResult(baseline, result));
        } catch (error) {
          if (!active()) return;
          dirty.set(id, active);
          if (baseline) io.write(id, [...baseline]);
          // A lost response can mean the toggle committed. Read; never toggle again.
          await repair(id, active).catch(() => {});
          if (active()) io.onError(error);
        }
      };
      const task = (tails.get(id) ?? Promise.resolve()).then(run);
      tails.set(id, task);
      return task.finally(() => { if (tails.get(id) === task) tails.delete(id); });
    },
    async reconcile(): Promise<void> {
      for (const [id, active] of [...dirty].slice(0, 20)) {
        if (!active()) { dirty.delete(id); continue; }
        if (tails.has(id)) continue;
        // Rotate retained ambiguous targets so a long history cannot starve.
        // Even a successful immediate read may precede a timed-out RPC's commit.
        dirty.delete(id); dirty.set(id, active);
        const task = repair(id, active).catch(() => {});
        tails.set(id, task);
        await task.finally(() => { if (tails.get(id) === task) tails.delete(id); });
      }
    },
  };
}

function sortReactions(rows: readonly ArenaReaction[]): ArenaReaction[] {
  return [...rows].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}
