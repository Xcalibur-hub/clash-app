/**
 * Per-message coordination between transcript snapshots and reaction mutations.
 *
 * Invariants:
 * 1. Snapshots and commits share one monotonic clock.
 * 2. Only a snapshot newer than the last applied one may supply reactions.
 * 3. A snapshot begun while a mutation is pending is never authoritative.
 * 4. A snapshot begun before a commit never supplies reactions.
 * 5. Body, edits and moderation always merge; only reactions are guarded.
 * 6. Retention is bounded and cleared on account/room disposal.
 */
import { mergeMessagesById } from './liveRoomThread.ts';

export interface SnapshotGuard {
  beginSnapshot(): number;
  beginMutation(messageId: string): void;
  commitMutation(messageId: string): void;
  /** Back-compat alias used by earlier callers and tests. */
  noteMutation(messageId: string): void;
  merge<T extends { id: string; reactions: unknown }>(current: readonly T[], incoming: readonly T[], snapshot: number): T[];
  protectedIds(): string[];
  reset(): void;
}

const MAX_TRACKED = 256;
interface Entry { lastApplied: number; pending: number; committedAt: number }

export function createReactionSnapshots(): SnapshotGuard {
  let seq = 0;
  const tracked = new Map<string, Entry>();
  const entryFor = (id: string): Entry => {
    const existing = tracked.get(id);
    if (existing) return existing;
    const created: Entry = { lastApplied: -1, pending: 0, committedAt: 0 };
    tracked.set(id, created);
    if (tracked.size > MAX_TRACKED) {
      for (const [key, value] of tracked) {
        if (value.pending > 0 || key === id) continue;
        tracked.delete(key);
        if (tracked.size <= MAX_TRACKED) break;
      }
    }
    return created;
  };
  const commit = (messageId: string): void => {
    if (!messageId) return;
    const entry = entryFor(messageId);
    entry.pending = Math.max(0, entry.pending - 1);
    seq += 1;
    entry.committedAt = seq;
  };
  return {
    beginSnapshot(): number { seq += 1; return seq; },
    beginMutation(messageId: string): void { if (messageId) entryFor(messageId).pending += 1; },
    commitMutation: commit,
    noteMutation: commit,
    merge<T extends { id: string; reactions: unknown }>(current: readonly T[], incoming: readonly T[], snapshot: number): T[] {
      const byId = new Map(current.map((row) => [row.id, row]));
      const safe = incoming.map((row) => {
        const existing = byId.get(row.id);
        if (!existing) return row;
        const entry = tracked.get(row.id) ?? entryFor(row.id);
        const authoritative = entry.pending === 0 && snapshot >= entry.committedAt && snapshot > entry.lastApplied;
        if (!authoritative) return { ...row, reactions: existing.reactions };
        entry.lastApplied = snapshot;
        return row;
      });
      return mergeMessagesById(current as never, safe as never) as unknown as T[];
    },
    protectedIds(): string[] { return [...tracked.entries()].filter(([, entry]) => entry.pending > 0).map(([id]) => id); },
    reset(): void { tracked.clear(); seq = 0; },
  };
}

