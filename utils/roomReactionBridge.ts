/**
 * Connects the reaction queue to snapshot ordering.
 *
 * Every authoritative repair write advances the snapshot clock, so a transcript
 * response that began before the repair can never roll its reaction fields back.
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
    onCommitted: (id) => input.snapshots.commitMutation(id),
  });
}
