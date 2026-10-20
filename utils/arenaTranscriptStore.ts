import { createReactionSnapshots } from './reactionSnapshots.ts';
import { createVisibilityBarrier } from './transcriptOrdering.ts';
import type { ArenaMessage } from '../services/liveArenaService';

/** The authoritative message cache. Transitions run once, outside React render. */
export function createArenaTranscriptStore() {
  let messages: ArenaMessage[] = [];
  Object.freeze(messages);
  const listeners = new Set<() => void>();
  const reactions = createReactionSnapshots();
  const visibility = createVisibilityBarrier();
  return {
    reactions, visibility,
    getSnapshot: (): ArenaMessage[] => messages,
    messagesRef: { get current(): ArenaMessage[] { return messages; } },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update(update: ArenaMessage[] | ((current: ArenaMessage[]) => ArenaMessage[])): void {
      // No await or React setter here. Ordering effects and rows are completed
      // before publication; replaying a React read cannot repeat the transition.
      const next = typeof update === 'function' ? update(messages) : update;
      if (next === messages) return;
      for (const row of next) {
        for (const reaction of row.reactions) Object.freeze(reaction);
        Object.freeze(row.reactions);
        Object.freeze(row);
      }
      messages = [...next];
      Object.freeze(messages);
      for (const listener of listeners) listener();
    },
  };
}
