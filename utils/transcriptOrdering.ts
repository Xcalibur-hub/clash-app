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

/** A scope-gated owner transition. Never evaluate it in a React state updater. */
export function createTranscriptUpdater<T extends Row>(
  accepted: readonly T[], snapshot: number, guard: SnapshotGuard,
  visibility: VisibilityBarrier, active: () => boolean, placeholderId?: string,
): (current: T[]) => T[] {
  return current => {
    if (!active()) return current;
    const rows = visibility.filterAccepted(accepted);
    const retained = placeholderId ? current.filter(row => row.id !== placeholderId) : current;
    return guard.merge(retained, rows, snapshot);
  };
}

export interface VisibilityBarrier {
  /** Synchronous owner boundary; aborted admissions and removals have no authority. */
  transaction<T>(run: () => T): T;
  epoch(): number;
  /** Establish removal now; apply it only while no later admission supersedes it. */
  mark(ids: readonly string[]): <T extends { id: string; pending?: boolean }>(current: readonly T[]) => T[];
  /** Conservative admission; empty when the request predates pruned evictions. */
  admit<T extends { id: string }>(rows: readonly T[], fetchEpoch: number): T[];
  /** True when a request that started at `fetchEpoch` may still be applied. */
  allows(fetchEpoch: number): boolean;
  /** Row-only recheck of a stable admitted batch; never rechecks the floor. */
  filterAccepted<T extends { id: string }>(rows: readonly T[]): T[];
  reset(): void;
}

const MAX_EVICTED = 500;

/** Authoritative evictions invalidate requests that began before them. */
export function createVisibilityBarrier(max = MAX_EVICTED): VisibilityBarrier {
  let revision = 0;
  let floor = 0;
  const evictedAt = new Map<string, number>();
  type Eligibility = { eligible: boolean };
  // ponytail: one ticket per admitted visible id in this scope, like the loaded
  // transcript. Eviction/reset releases it; batches retain invalidated tickets
  // so deferred application/replay remains safe after tombstone pruning.
  const eligibleIds = new Map<string, Eligibility>();
  const batches = new WeakMap<object, Eligibility[]>();
  let addedBatches: object[] | null = null;
  return {
    transaction<T>(run: () => T): T {
      const evictions = new Map(evictedAt), eligible = new Map(eligibleIds);
      const flags = new Map([...eligible.values()].map(ticket => [ticket, ticket.eligible]));
      const savedFloor = floor, parent = addedBatches, added: object[] = [];
      addedBatches = added;
      try {
        const result = run();
        if (parent) for (const batch of added) parent.push(batch);
        return result;
      } catch (error) {
        for (const ticket of eligibleIds.values()) ticket.eligible = false;
        eligibleIds.clear();
        for (const [ticket, value] of flags) ticket.eligible = value;
        for (const [id, ticket] of eligible) eligibleIds.set(id, ticket);
        evictedAt.clear();
        for (const [id, at] of evictions) evictedAt.set(id, at);
        for (const batch of added) batches.delete(batch);
        floor = savedFloor;
        // Keep revision monotonic so aborted epochs cannot collide with a later eviction.
        throw error;
      } finally { addedBatches = parent; }
    },
    epoch(): number { return revision; },
    mark(ids: readonly string[]) {
      revision += 1;
      for (const id of ids) {
        if (!id) continue;
        const ticket = eligibleIds.get(id);
        if (ticket) ticket.eligible = false;
        eligibleIds.delete(id);
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
      const removed = new Set(ids);
      // mark() removed every prior ticket for these ids. Any live ticket now
      // belongs to a later authorized admission; a later mark removes it again.
      return <T extends { id: string; pending?: boolean }>(current: readonly T[]): T[] => current.filter(row =>
        row.pending || !removed.has(row.id) || eligibleIds.has(row.id));
    },
    allows(fetchEpoch: number): boolean { return fetchEpoch >= floor; },
    admit<T extends { id: string }>(rows: readonly T[], fetchEpoch: number): T[] {
      if (fetchEpoch < floor) return [];
      const accepted = rows.filter((row) => {
        const at = evictedAt.get(row.id);
        return at === undefined || at <= fetchEpoch;
      });
      batches.set(accepted, accepted.map(row => {
        let ticket = eligibleIds.get(row.id);
        if (!ticket) { ticket = { eligible: true }; eligibleIds.set(row.id, ticket); }
        return ticket;
      }));
      addedBatches?.push(accepted);
      return accepted;
    },
    filterAccepted<T extends { id: string }>(rows: readonly T[]): T[] {
      const tickets = batches.get(rows);
      return rows.filter((_row, index) => tickets?.[index].eligible === true);
    },
    reset(): void {
      for (const ticket of eligibleIds.values()) ticket.eligible = false;
      eligibleIds.clear(); evictedAt.clear();
      revision += 1; floor = revision;
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

/** Immutable identity for one mounted room occupancy. */
export interface RoomSession {
  roomId: string;
  generation: number;
}

/** True only while this occupancy still owns the hook. */
export function isLiveRoomSession(
  mounted: boolean,
  session: RoomSession,
  current: RoomSession,
): boolean {
  return mounted
    && session.generation === current.generation
    && session.roomId === current.roomId;
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
