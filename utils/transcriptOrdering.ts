/**
 * Transcript ordering helpers shared by initial load, refresh, pagination,
 * hydration, posting and visibility reconciliation.
 *
 * Reactions flow through the existing SnapshotGuard. Visibility uses one
 * bounded watermark: requests that began before a pruned eviction are refused
 * wholesale, so pruning can never resurrect a hidden message.
 */
import type { SnapshotGuard } from './reactionSnapshots.ts';

type Row = { id: string; pending?: boolean; reactions: unknown };

/**
 * Initial page merges into the loaded cache. Absence from a bounded page is
 * not authoritative deletion, so hydrated, historical and pending rows stay.
 */
export function mergeInitialPage<T extends Row>(
  current: readonly T[],
  thread: readonly T[],
  snapshot: number,
  guard: SnapshotGuard,
): T[] {
  return guard.merge(current, thread, snapshot) as T[];
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
  /** Conservative admission; empty when the request predates pruned evictions. */
  admit<T extends { id: string }>(rows: readonly T[], fetchEpoch: number): T[];
  /** True when a request that started at `fetchEpoch` may still be applied. */
  allows(fetchEpoch: number): boolean;
}

const MAX_EVICTED = 500;

/** Authoritative evictions invalidate requests that began before them. */
export function createVisibilityBarrier(max = MAX_EVICTED): VisibilityBarrier {
  let revision = 0;
  let floor = 0;
  const evictedAt = new Map<string, number>();
  return {
    epoch(): number { return revision; },
    mark(ids: readonly string[]): void {
      revision += 1;
      for (const id of ids) {
        if (!id) continue;
        evictedAt.delete(id);
        evictedAt.set(id, revision);
      }
      while (evictedAt.size > max) {
        const oldest = evictedAt.entries().next();
        if (oldest.done) break;
        const [id, at] = oldest.value;
        evictedAt.delete(id);
        if (at > floor) floor = at;
      }
    },
    allows(fetchEpoch: number): boolean { return fetchEpoch >= floor; },
    admit<T extends { id: string }>(rows: readonly T[], fetchEpoch: number): T[] {
      if (fetchEpoch < floor) return [];
      return rows.filter((row) => {
        const at = evictedAt.get(row.id);
        return at === undefined || at <= fetchEpoch;
      });
    },
  };
}

export interface SendResolution {
  applyRow: boolean;
  clearPlaceholder: boolean;
  reportSuccess: boolean;
}

/** A send may only touch state while it still belongs to the live scope. */
export function isCurrentScope(
  mounted: boolean,
  sentGeneration: number,
  currentGeneration: number,
): boolean {
  return mounted && sentGeneration === currentGeneration;
}

export function resolveSendResolution(input: {
  mounted: boolean;
  sentGeneration: number;
  currentGeneration: number;
}): SendResolution {
  const current = isCurrentScope(input.mounted, input.sentGeneration, input.currentGeneration);
  return current
    ? { applyRow: true, clearPlaceholder: true, reportSuccess: true }
    : { applyRow: false, clearPlaceholder: false, reportSuccess: false };
}
