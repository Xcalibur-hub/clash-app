/**
 * Per-message coordination between transcript snapshots and reaction writes.
 * Full-row fields use a separate local read-start order, not a server revision.
 *
 * Mutation ownership is explicit:
 *  - beginMutation / finishMutation bracket ONE user toggle each.
 *  - markAuthoritativeReactionWrite advances the ordering barrier (toggle
 *    success or authoritative repair) without completing a pending toggle.
 * Eviction is safe: a global watermark rejects snapshots that began before the
 * most recent eviction, so an evicted message cannot accept stale reactions.
 */
import { mergeMessagesById } from './liveRoomThread.ts';

export interface SnapshotGuard {
  beginSnapshot(): number;
  beginMutation(messageId: string): void;
  finishMutation(messageId: string): void;
  markAuthoritativeReactionWrite(messageId: string): void;
  /** Back-compat: mark authoritative and finish one mutation. */
  commitMutation(messageId: string): void;
  noteMutation(messageId: string): void;
  merge<T extends { id: string; reactions: unknown }>(current: readonly T[], incoming: readonly T[], snapshot: number): T[];
  protectedIds(): string[];
  reset(): void;
}

const MAX_TRACKED = 256;
interface Entry { lastApplied: number; lastBodyApplied: number; pending: number; committedAt: number }

export function createReactionSnapshots(): SnapshotGuard {
  let seq = 0;
  let evictedSince = 0;
  const tracked = new Map<string, Entry>();
  const entryFor = (id: string): Entry => {
    const existing = tracked.get(id);
    if (existing) return existing;
    // Recreation inherits the eviction floor so protection survives eviction.
    const floor = evictedSince > 0 ? evictedSince : -1;
    const created: Entry = { lastApplied: floor, lastBodyApplied: floor, pending: 0, committedAt: evictedSince };
    tracked.set(id, created);
    if (tracked.size > MAX_TRACKED) {
      for (const [key, value] of tracked) {
        if (value.pending > 0 || key === id) continue;
        tracked.delete(key);
        evictedSince = seq;
        if (tracked.size <= MAX_TRACKED) break;
      }
    }
    return created;
  };
  const mark = (messageId: string): void => {
    if (!messageId) return;
    const entry = entryFor(messageId);
    seq += 1;
    entry.committedAt = seq;
  };
  const finish = (messageId: string): void => {
    if (!messageId) return;
    const entry = entryFor(messageId);
    entry.pending = Math.max(0, entry.pending - 1);
  };
  return {
    beginSnapshot(): number { seq += 1; return seq; },
    beginMutation(messageId: string): void { if (messageId) entryFor(messageId).pending += 1; },
    finishMutation: finish,
    markAuthoritativeReactionWrite: mark,
    commitMutation(messageId: string): void { mark(messageId); finish(messageId); },
    noteMutation(messageId: string): void { mark(messageId); finish(messageId); },
    merge<T extends { id: string; reactions: unknown }>(current: readonly T[], incoming: readonly T[], snapshot: number): T[] {
      const byId = new Map(current.map((row) => [row.id, row]));
      const safe = incoming.map((row) => {
        const existing = byId.get(row.id);
        if (!existing) {
          const inserted = entryFor(row.id);
          inserted.lastApplied = Math.max(inserted.lastApplied, snapshot);
          inserted.lastBodyApplied = Math.max(inserted.lastBodyApplied, snapshot);
          return row;
        }
        const entry = tracked.get(row.id);
        if (!entry) {
          // No live entry: it was never tracked or was evicted. Reject any
          // snapshot that began at or before the last eviction; adopt newer ones.
          if (evictedSince > 0 && snapshot <= evictedSince) return existing;
          const created = entryFor(row.id);
          created.lastApplied = snapshot;
          created.lastBodyApplied = snapshot;
          return row;
        }
        // No server edit revision is exposed. Conservatively order full-row
        // fields by local read start, independently of reaction mutations.
        const afterEviction = evictedSince === 0 || snapshot > evictedSince;
        const body = snapshot >= entry.lastBodyApplied && afterEviction ? row : existing;
        entry.lastBodyApplied = Math.max(entry.lastBodyApplied, snapshot);
        // Equal tokens allow reevaluation of this read against an earlier React
        // base; an inherited eviction floor is still strictly excluded.
        const authoritative = entry.pending === 0 && snapshot >= entry.committedAt
          && snapshot >= entry.lastApplied && afterEviction;
        if (!authoritative) return { ...body, reactions: existing.reactions };
        entry.lastApplied = snapshot;
        return { ...body, reactions: row.reactions };
      });
      return mergeMessagesById(current as never, safe as never) as unknown as T[];
    },
    protectedIds(): string[] { return [...tracked.entries()].filter(([, entry]) => entry.pending > 0).map(([id]) => id); },
    reset(): void { tracked.clear(); seq = 0; evictedSince = 0; },
  };
}

