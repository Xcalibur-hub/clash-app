/**
 * Who may use the private assist flow, and in which mode. Presentation only:
 * the server remains the authority for every submission and response.
 */
import type { ArenaPhase } from '../services/liveArenaService';
import type { ArenaDuel } from './arenaDuelPayload';

export type AssistMode = 'hidden' | 'closed' | 'compose' | 'inbox';

export function assistAvailability({
  viewerRelationship,
  status,
  phase,
  threadLocked = false,
}: {
  viewerRelationship: ArenaDuel['viewerRelationship'];
  status: ArenaDuel['status'];
  phase: ArenaPhase;
  threadLocked?: boolean;
}): AssistMode {
  // Staff never participate in the assist flow, and a locked thread has no room.
  if (viewerRelationship === 'staff' || threadLocked) return 'hidden';
  const fighter = viewerRelationship === 'fighter_a' || viewerRelationship === 'fighter_b';
  const open = status === 'open' && (phase === 'open' || phase === 'final_arguments');
  if (!open) return 'closed';
  return fighter ? 'inbox' : 'compose';
}
