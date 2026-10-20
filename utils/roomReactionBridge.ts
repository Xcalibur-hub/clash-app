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
