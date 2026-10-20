/**
 * Bridges the reaction queue to snapshot ordering.
 * Exposes enqueue toggles plus readAuthoritative for session-safe repairs.
 */
import { createReactionQueue, type ReactionResult } from './reactionOptimism.ts';
import type { SnapshotGuard } from './reactionSnapshots.ts';
import type { ArenaReaction } from '../services/liveArenaService';

export function createRoomReactionBridge(input: {
  snapshots: SnapshotGuard;
  read: (id: string) => Promise<readonly ArenaReaction[] | null>;
  toggle: (id: string, emoji: string) => Promise<ReactionResult>;
  write: (id: string, rows: ArenaReaction[] | null) => void;
  onError: (error: unknown) => void;
}) {
  return createReactionQueue({
    read: input.read,
    toggle: input.toggle,
    write: input.write,
    onError: input.onError,
    // Advances ordering only; pending ownership stays with the user mutation.
    onCommitted: (id) => input.snapshots.markAuthoritativeReactionWrite(id),
  });
}

/**
 * Merge-based publisher for readAuthoritative. Uses the captured read-start
 * snapshot token; never mints beginReactionWrite (which would bypass older reads).
 */
export function createMergeReactionPublisher<T extends { id: string; reactions: ArenaReaction[] }>(input: {
  snapshots: SnapshotGuard;
  update: (fn: (current: T[]) => T[]) => void;
}): (messageId: string, rows: ArenaReaction[] | null, snapshot: number) => boolean {
  return (messageId, rows, snapshot) => {
    let accepted = false;
    input.update((current) => {
      const existing = current.find((item) => item.id === messageId);
      if (!existing) return current;
      if (rows === null) {
        accepted = true;
        return current.filter((item) => item.id !== messageId);
      }
      const next = input.snapshots.merge(
        current,
        [{ ...existing, reactions: rows }],
        snapshot,
      );
      accepted = next.find((item) => item.id === messageId)?.reactions !== existing.reactions;
      return next;
    });
    return accepted;
  };
}
