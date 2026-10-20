/**
 * Reaction state transitions and serialized mutations.
 * Ambiguous failures are repaired by authoritative reads only; a toggle is
 * never retried, and unresolved repairs survive offline time until a read lands.
 * Overflow is explicit: dropped targets stay unresolved and request a refresh.
 */
import type { ArenaReaction } from '../services/liveArenaService';

export interface ReactionResult { messageId: string; emoji: string; reacted: boolean; count: number }

export function applyOptimisticReaction(rows: readonly ArenaReaction[], emoji: string): ArenaReaction[] {
  if (!emoji) return [...rows];
  const existing = rows.some((row) => row.emoji === emoji);
  const next = existing
    ? rows.map((row) => (row.emoji === emoji ? { ...row, viewerReacted: !row.viewerReacted } : row))
    : [...rows, { emoji, count: 0, viewerReacted: true }];
  return sortReactions(next);
}

export function mergeReactionResult(rows: readonly ArenaReaction[], result: Pick<ReactionResult, 'emoji' | 'count' | 'reacted'>): ArenaReaction[] {
  const others = rows.filter((row) => row.emoji !== result.emoji);
  const next = result.count > 0 ? [...others, { emoji: result.emoji, count: result.count, viewerReacted: result.reacted }] : others;
  return sortReactions(next);
}

export function reactionSequenceAccepted(latest: number | undefined, mine: number): boolean { return latest === mine; }
export function restoreReactions(prior: readonly ArenaReaction[] | null): ArenaReaction[] | null { return prior ? [...prior] : null; }

export function createReactionQueue(io: {
  read: (id: string) => Promise<readonly ArenaReaction[] | null>;
  toggle: (id: string, emoji: string) => Promise<ReactionResult>;
  write: (id: string, rows: ArenaReaction[] | null) => void;
  onError: (error: unknown) => void;
  /** A committed mutation or an authoritative repair read for this message. */
  onCommitted?: (id: string) => void;
}) {
  const tails = new Map<string, Promise<void>>();
  /** Retained until two completed authoritative reads; capped and scope-cleared. */
  const dirty = new Map<string, { active: () => boolean; reads: number }>();
  const MAX_RETAINED = 100;
  const MAX_REPAIR_BATCH = 20;
  let dropped = 0;
  let refreshRequested = false;
  const retain = (id: string, active: () => boolean): void => {
    if (dirty.has(id)) return;
    dirty.set(id, { active, reads: 0 });
    if (dirty.size > MAX_RETAINED) {
      /* Overflow contract: a dropped target is unresolved, never "repaired". */
      for (const key of dirty.keys()) {
        if (key === id) continue;
        dirty.delete(key);
        dropped += 1;
        refreshRequested = true;
        break;
      }
    }
  };
  const repair = async (id: string, active: () => boolean): Promise<boolean> => {
    const rows = await io.read(id);
    if (!active()) return false;
    io.write(id, rows ? [...rows] : null);
    io.onCommitted?.(id);
    return true;
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
          io.onCommitted?.(id);
          dirty.delete(id);
        } catch (error) {
          if (!active()) return;
          retain(id, active);
          if (baseline) io.write(id, [...baseline]);
          // A lost response may have committed. Read; never toggle again.
          await repair(id, active).then((ok) => {
            if (!ok) return;
            const entry = dirty.get(id);
            if (entry && (entry.reads += 1) >= 2) dirty.delete(id);
          }).catch(() => {});
          if (active()) io.onError(error);
        }
      };
      const task = (tails.get(id) ?? Promise.resolve()).then(run);
      tails.set(id, task);
      return task.finally(() => { if (tails.get(id) === task) tails.delete(id); });
    },
    async reconcile(): Promise<void> {
      let processed = 0;
      for (const [id, entry] of [...dirty]) {
        if (processed >= MAX_REPAIR_BATCH) break;
        if (!entry.active()) { dirty.delete(id); continue; }
        if (tails.has(id)) continue;
        processed += 1;
        const task = repair(id, entry.active).then((ok) => {
          if (!ok) return;
          if ((entry.reads += 1) >= 2) dirty.delete(id);
        }).catch(() => {});
        tails.set(id, task);
        await task.finally(() => { if (tails.get(id) === task) tails.delete(id); });
      }
    },
    pendingRepairs(): number { return dirty.size; },
    overflow(): { dropped: number; requested: boolean } { return { dropped, requested: refreshRequested }; },
    consumeOverflowRequest(): boolean {
      const requested = refreshRequested;
      refreshRequested = false;
      return requested;
    },
    reset(): void { dirty.clear(); dropped = 0; refreshRequested = false; },
  };
}

function sortReactions(rows: readonly ArenaReaction[]): ArenaReaction[] {
  return [...rows].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}
