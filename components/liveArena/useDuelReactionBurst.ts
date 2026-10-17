/**
 * Replays a reaction burst only when the real reaction counts on the newest
 * Stage message actually rise. Never invents a reaction, never reads a tally
 * into the UI, and never bursts on first paint.
 */
import React from 'react';
import type { ArenaMessage } from '../../services/liveArenaService';
import {
  reactionBurstFor,
  type ReactionBurstSignal,
  type ReactionCount,
} from './liveArenaStyles';

interface Seen {
  id: string;
  reactions: readonly ReactionCount[];
}

export function useDuelReactionBurst(message: ArenaMessage | null): ReactionBurstSignal | null {
  const seen = React.useRef<Seen | null>(null);
  const [burst, setBurst] = React.useState<ReactionBurstSignal | null>(null);
  const id = message?.id ?? null;
  const reactions = message?.reactions ?? null;

  React.useEffect(() => {
    const previous = seen.current;
    seen.current = id && reactions ? { id, reactions } : null;
    if (!id || !reactions) return;
    // A different message is a fresh baseline: no burst while it first paints.
    if (!previous || previous.id !== id) return;
    const next = reactionBurstFor(previous.reactions, reactions, id);
    if (next) setBurst(next);
  }, [id, reactions]);

  return burst;
}
