/**
 * Coordinates transcript snapshots with reaction mutations.
 *
 * A snapshot begins at a monotonic version. A successful mutation records a
 * newer version for its message. Any snapshot that started *before* that
 * mutation must not overwrite the message's reaction fields, while its text,
 * edits and moderation fields still apply. A later snapshot is authoritative
 * and clears the protection.
 */
import { mergeMessagesById } from './liveRoomThread.ts';

export interface SnapshotGuard {
  beginSnapshot(): number;
  noteMutation(messageId: string): void;
  merge<T extends { id: string; reactions: unknown }>(
    current: readonly T[],
    incoming: readonly T[],
    snapshot: number,
  ): T[];
  protectedIds(): string[];
  reset(): void;
}

export function createReactionSnapshots(): SnapshotGuard {
  let version = 0;
  const mutatedAt = new Map<string, number>();
  return {
    beginSnapshot(): number {
      return version;
    },
    noteMutation(messageId: string): void {
      if (!messageId) return;
      version += 1;
      mutatedAt.set(messageId, version);
    },
    merge<T extends { id: string; reactions: unknown }>(
      current: readonly T[],
      incoming: readonly T[],
      snapshot: number,
    ): T[] {
      if (mutatedAt.size === 0) return mergeMessagesById(current as never, incoming as never) as unknown as T[];
      const byId = new Map(current.map((row) => [row.id, row]));
      const safe = incoming.map((row) => {
        const existing = byId.get(row.id);
        const at = mutatedAt.get(row.id);
        if (!existing || at === undefined) return row;
        if (snapshot < at) return { ...row, reactions: existing.reactions };
        mutatedAt.delete(row.id);
        return row;
      });
      return mergeMessagesById(current as never, safe as never) as unknown as T[];
    },
    protectedIds(): string[] {
      return [...mutatedAt.keys()];
    },
    reset(): void {
      mutatedAt.clear();
      version = 0;
    },
  };
}
