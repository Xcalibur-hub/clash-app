import { createReactionSnapshots } from './reactionSnapshots.ts';
import { createVisibilityBarrier } from './transcriptOrdering.ts';
import type { ArenaMessage } from '../services/liveArenaService';

type Update = ArenaMessage[] | ((current: ArenaMessage[]) => ArenaMessage[]);

/**
 * The authoritative message cache. Transitions run once, outside React render.
 *
 * Nested updates are serialized: a write that begins while another transition
 * is open is queued and applied after the outer transition publishes. Silent
 * overwrites of a committed inner transition are not allowed.
 */
export function createArenaTranscriptStore() {
  let messages: ArenaMessage[] = [];
  Object.freeze(messages);
  const listeners = new Set<() => void>();
  const reactions = createReactionSnapshots();
  const visibility = createVisibilityBarrier();
  let depth = 0;
  const queued: Update[] = [];

  const publish = (next: ArenaMessage[]): void => {
    if (next === messages) return;
    for (const row of next) {
      for (const reaction of row.reactions) Object.freeze(reaction);
      Object.freeze(row.reactions);
      Object.freeze(row);
    }
    messages = [...next];
    Object.freeze(messages);
    for (const listener of listeners) listener();
  };

  const run = (update: Update): void => {
    const next = typeof update === 'function' ? update(messages) : update;
    publish(next);
  };

  return {
    reactions, visibility,
    getSnapshot: (): ArenaMessage[] => messages,
    messagesRef: { get current(): ArenaMessage[] { return messages; } },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    update(update: Update): void {
      // No await or React setter here. Ordering effects and rows are completed
      // before publication; replaying a React read cannot repeat the transition.
      if (depth > 0) {
        queued.push(update);
        return;
      }
      depth = 1;
      try {
        run(update);
        while (queued.length) run(queued.shift()!);
      } finally {
        depth = 0;
        queued.length = 0;
      }
    },
  };
}
