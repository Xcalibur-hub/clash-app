/**
 * Transcript ordering helpers shared by initial load, posting and hydration.
 * Reactions flow through the existing SnapshotGuard; visibility evictions use a
 * narrow barrier that only blocks requests which started before the eviction.
 */
import type { SnapshotGuard } from './reactionSnapshots.ts';

type Row = { id: string; pending?: boolean; reactions: unknown };

/** Initial page replaces the view but keeps newer reactions and pending rows. */
export function mergeInitialPage<T extends Row>(
  current: readonly T[],
  thread: readonly T[],
  snapshot: number,
  guard: SnapshotGuard,
): T[] {
  const serverIds = new Set(thread.map((row) => row.id));
  const merged = guard.merge(current, thread, snapshot) as T[];
  return merged.filter((row) => serverIds.has(row.id) || row.pending === true);
}

/** A delayed post response wins for its own row but never overwrites newer reactions. */
export function mergePostedRow<T extends Row>(
  current: readonly T[],
  posted: T,
  placeholderId: string,
  snapshot: number,
  guard: SnapshotGuard,
): T[] {
  const cleared = current.filter((row) => row.id !== placeholderId);
  return guard.merge(cleared, [posted], snapshot) as T[];
}

export interface VisibilityBarrier {
  epoch(): number;
  mark(ids: readonly string[]): void;
  filter<T extends { id: string }>(rows: readonly T[], fetchEpoch: number): T[];
}

const MAX_EVICTED = 500;

/** Authoritative evictions invalidate only requests that began before them. */
export function createVisibilityBarrier(): VisibilityBarrier {
  let revision = 0;
  const evictedAt = new Map<string, number>();
  return {
    epoch(): number { return revision; },
    mark(ids: readonly string[]): void {
      revision += 1;
      for (const id of ids) {
        if (!id) continue;
        evictedAt.delete(id);
        evictedAt.set(id, revision);
        if (evictedAt.size > MAX_EVICTED) {
          for (const old of evictedAt.keys()) { evictedAt.delete(old); break; }
        }
      }
    },
    filter<T extends { id: string }>(rows: readonly T[], fetchEpoch: number): T[] {
      return rows.filter((row) => {
        const at = evictedAt.get(row.id);
        return at === undefined || at <= fetchEpoch;
      });
    },
  };
}
