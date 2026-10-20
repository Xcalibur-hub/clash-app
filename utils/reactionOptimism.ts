/** Reaction mutations with bounded, scope-safe ambiguous recovery. */
import type { ArenaReaction } from '../services/liveArenaService';
import type { RoomSession } from './transcriptOrdering.ts';

export interface ReactionResult { messageId: string; emoji: string; reacted: boolean; count: number }
export interface OverflowState { dropped: number; requested: boolean; tracked: number; deficit: number }
export interface RecoveryResult { attempted: number; remainingLoaded: number; parked: number; deficit: number }

/** Outcome of one session-safe authoritative reaction-state read. */
export type AuthoritativeReactionReadOutcome =
  | { status: 'applied'; messageId: string }
  | {
      status: 'skipped';
      messageId: string;
      reason: 'stale_session' | 'not_loaded' | 'superseded';
    }
  | { status: 'failed'; messageId: string; error: unknown; retryable: true };

export interface AuthoritativeReactionReadInput {
  messageId: string;
  /** Captured occupancy lease; never reacquire the live session after resume. */
  session: RoomSession;
  isLiveSession: (session: RoomSession) => boolean;
  /** True only while this id is present in the loaded transcript. */
  isLoaded: (messageId: string) => boolean;
}

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
  onCommitted?: (id: string) => void;
}) {
  const tails = new Map<string, Promise<void>>();
  const dirty = new Map<string, { active: () => boolean; reads: number }>();
  const MAX_RETAINED = 100;
  const MAX_REPAIR_BATCH = 20;
  const MAX_DROPPED_IDS = 50;
  const droppedIds: string[] = [];
  const committed = new Map<string, number>();
  let commitSeq = 0;
  let dropped = 0;
  let deficit = 0;
  let refreshRequested = false;
  let sweepCursor = 0;

  const bump = (id: string): void => { commitSeq += 1; committed.set(id, commitSeq); };
  const retain = (id: string, active: () => boolean): void => {
    if (dirty.has(id)) return;
    dirty.set(id, { active, reads: 0 });
    if (dirty.size > MAX_RETAINED) {
      for (const key of dirty.keys()) {
        if (key === id) continue;
        dirty.delete(key);
        dropped += 1;
        refreshRequested = true;
        if (droppedIds.length < MAX_DROPPED_IDS) {
          if (!droppedIds.includes(key)) droppedIds.push(key);
        } else {
          // Unknown-coverage deficit: a forgotten target still needs loaded-scope
          // reconciliation before recovery can be acknowledged.
          deficit += 1;
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
    bump(id);
    return true;
  };
  const applyAuthoritative = (id: string): void => { io.onCommitted?.(id); bump(id); };

  /**
   * Session-safe authoritative reaction-state read for one already-loaded row.
   *
   * Waits for any in-flight mutation/read on the id, then performs the server
   * read without holding the tail so a newer toggle can commit and supersede
   * this snapshot. Publication re-enters the per-message tail so duplicate
   * reads cannot apply out of order. Never toggles; never inserts rows.
   */
  const readAuthoritative = async (
    input: AuthoritativeReactionReadInput,
  ): Promise<AuthoritativeReactionReadOutcome> => {
    const { messageId, session, isLiveSession, isLoaded } = input;
    await (tails.get(messageId) ?? Promise.resolve()).catch(() => {});
    if (!isLiveSession(session)) {
      return { status: 'skipped', messageId, reason: 'stale_session' };
    }
    if (!isLoaded(messageId)) {
      return { status: 'skipped', messageId, reason: 'not_loaded' };
    }
    const startCommit = committed.get(messageId) ?? 0;
    let rows: readonly ArenaReaction[] | null;
    try {
      rows = await io.read(messageId);
    } catch (error) {
      return { status: 'failed', messageId, error, retryable: true };
    }
    // Re-check the captured lease — never reacquire the current session.
    if (!isLiveSession(session)) {
      return { status: 'skipped', messageId, reason: 'stale_session' };
    }
    if (!isLoaded(messageId)) {
      // Reaction-only reads must not resurrect or tombstone unloaded rows.
      return { status: 'skipped', messageId, reason: 'not_loaded' };
    }
    if ((committed.get(messageId) ?? 0) !== startCommit) {
      return { status: 'skipped', messageId, reason: 'superseded' };
    }
    if (tails.has(messageId)) {
      return { status: 'skipped', messageId, reason: 'superseded' };
    }

    let settle!: (outcome: AuthoritativeReactionReadOutcome) => void;
    const result = new Promise<AuthoritativeReactionReadOutcome>((resolve) => { settle = resolve; });
    const publish = async (): Promise<void> => {
      if (!isLiveSession(session)) {
        settle({ status: 'skipped', messageId, reason: 'stale_session' });
        return;
      }
      if (!isLoaded(messageId)) {
        settle({ status: 'skipped', messageId, reason: 'not_loaded' });
        return;
      }
      if ((committed.get(messageId) ?? 0) !== startCommit) {
        settle({ status: 'skipped', messageId, reason: 'superseded' });
        return;
      }
      io.write(messageId, rows ? [...rows] : null);
      applyAuthoritative(messageId);
      settle({ status: 'applied', messageId });
    };
    const task = (tails.get(messageId) ?? Promise.resolve()).then(publish, publish);
    tails.set(messageId, task);
    void task.finally(() => { if (tails.get(messageId) === task) tails.delete(messageId); });
    return result;
  };

  return {
    readAuthoritative,
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
          applyAuthoritative(id);
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
    async recoverDropped(input: {
      isLoaded: (id: string) => boolean;
      loadedIds: readonly string[];
      active: () => boolean;
      generation: number;
      currentGeneration: () => number;
      limit?: number;
    }): Promise<RecoveryResult> {
      const valid = (): boolean => input.active() && input.generation === input.currentGeneration();
      const remainingLoaded = (): number => droppedIds.filter(input.isLoaded).length;
      const parked = (): number => droppedIds.filter((id) => !input.isLoaded(id)).length;
      const limit = Math.max(0, input.limit ?? 20);
      if (!valid()) return { attempted: 0, remainingLoaded: remainingLoaded(), parked: parked(), deficit };
      let attempted = 0;

      for (const id of droppedIds.filter(input.isLoaded).slice(0, limit)) {
        if (!valid()) return { attempted, remainingLoaded: remainingLoaded(), parked: parked(), deficit };
        const startCommit = committed.get(id) ?? 0;
        attempted += 1;
        try {
          const rows = await io.read(id);
          // Scope and ordering checks happen immediately after the await.
          if (!valid()) return { attempted, remainingLoaded: remainingLoaded(), parked: parked(), deficit };
          if ((committed.get(id) ?? 0) !== startCommit) {
            // A newer authoritative write landed while this read was in flight.
            const index = droppedIds.indexOf(id);
            if (index >= 0) droppedIds.splice(index, 1);
            continue;
          }
          if (tails.has(id)) continue; // a mutation is still pending; keep the obligation
          io.write(id, rows ? [...rows] : null);
          applyAuthoritative(id);
          const index = droppedIds.indexOf(id);
          if (index >= 0) droppedIds.splice(index, 1);
        } catch { /* keep for a later pass */ }
      }

      // Bounded loaded-scope sweep when individual ids were forgotten.
      if (deficit > 0 && attempted < limit) {
        let failures = 0;
        while (attempted < limit && sweepCursor < input.loadedIds.length) {
          if (!valid()) return { attempted, remainingLoaded: remainingLoaded(), parked: parked(), deficit };
          const id = input.loadedIds[sweepCursor];
          sweepCursor += 1;
          attempted += 1;
          try {
            const rows = await io.read(id);
            if (!valid()) return { attempted, remainingLoaded: remainingLoaded(), parked: parked(), deficit };
            io.write(id, rows ? [...rows] : null);
            applyAuthoritative(id);
          } catch { failures += 1; }
        }
        if (sweepCursor >= input.loadedIds.length) {
          sweepCursor = 0;
          if (failures === 0) deficit = 0;
        }
      }

      return { attempted, remainingLoaded: remainingLoaded(), parked: parked(), deficit };
    },
    pendingRepairs(): number { return dirty.size; },
    overflow(): OverflowState { return { dropped, requested: refreshRequested, tracked: droppedIds.length, deficit }; },
    consumeOverflowRequest(): boolean {
      const requested = refreshRequested;
      refreshRequested = false;
      return requested;
    },
    reset(): void { dirty.clear(); droppedIds.length = 0; dropped = 0; deficit = 0; refreshRequested = false; sweepCursor = 0; committed.clear(); },
  };
}

function sortReactions(rows: readonly ArenaReaction[]): ArenaReaction[] {
  return [...rows].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}
