/**
 * Reaction mutations and bounded ambiguous recovery.
 * A toggle is never retried. Overflow is explicit: dropped targets remain
 * unresolved, are tracked in a bounded list, and are recovered by targeted
 * authoritative reads for messages still in loaded scope.
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

export interface OverflowState { dropped: number; requested: boolean; tracked: number }
export interface RecoveryResult { attempted: number; remainingLoaded: number; parked: number }

export function createReactionQueue(io: {
  read: (id: string) => Promise<readonly ArenaReaction[] | null>;
  toggle: (id: string, emoji: string) => Promise<ReactionResult>;
  write: (id: string, rows: ArenaReaction[] | null) => void;
  onError: (error: unknown) => void;
  onCommitted?: (id: string) => void;
}) {
  const tails = new Map<string, Promise<void>>();
  const dirty = new Map<string, { active: () => boolean; reads: number }>();
  const MAX_RETAINED = 100;
  const MAX_REPAIR_BATCH = 20;
  const MAX_DROPPED_IDS = 50;
  const droppedIds: string[] = [];
  let dropped = 0;
  let refreshRequested = false;

  const retain = (id: string, active: () => boolean): void => {
    if (dirty.has(id)) return;
    dirty.set(id, { active, reads: 0 });
    if (dirty.size > MAX_RETAINED) {
      for (const key of dirty.keys()) {
        if (key === id) continue;
        dirty.delete(key);
        dropped += 1;
        refreshRequested = true;
        if (!droppedIds.includes(key)) {
          droppedIds.push(key);
          if (droppedIds.length > MAX_DROPPED_IDS) droppedIds.shift();
        }
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
    /** Targeted recovery for overflow-dropped targets still in loaded scope. */
    async recoverDropped(isLoaded: (id: string) => boolean, limit = 20): Promise<RecoveryResult> {
      const parked = droppedIds.filter((id) => !isLoaded(id));
      const loaded = droppedIds.filter(isLoaded);
      let attempted = 0;
      for (const id of loaded.slice(0, Math.max(0, limit))) {
        attempted += 1;
        try {
          const rows = await io.read(id);
          io.write(id, rows ? [...rows] : null);
          io.onCommitted?.(id);
          const index = droppedIds.indexOf(id);
          if (index >= 0) droppedIds.splice(index, 1);
        } catch { /* keep for a later pass */ }
      }
      return { attempted, remainingLoaded: droppedIds.filter(isLoaded).length, parked: parked.length };
    },
    pendingRepairs(): number { return dirty.size; },
    overflow(): OverflowState { return { dropped, requested: refreshRequested, tracked: droppedIds.length }; },
    consumeOverflowRequest(): boolean {
      const requested = refreshRequested;
      refreshRequested = false;
      return requested;
    },
    reset(): void { dirty.clear(); droppedIds.length = 0; dropped = 0; refreshRequested = false; },
  };
}

function sortReactions(rows: readonly ArenaReaction[]): ArenaReaction[] {
  return [...rows].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}
