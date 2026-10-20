import { createReactionSnapshots } from './reactionSnapshots.ts';
import { createVisibilityBarrier } from './transcriptOrdering.ts';
import type { ArenaMessage } from '../services/liveArenaService';

type Update = ArenaMessage[] | ((current: ArenaMessage[]) => ArenaMessage[]);
const MAX_TRANSITIONS = 64;

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

  let accepted = 0;
  const run = (update: Update, errors: unknown[]): void => {
    const next = visibility.transaction(() => reactions.transaction(() => {
      const candidate = typeof update === 'function' ? update(messages) : update;
      if (candidate === messages) return messages;
      for (const row of candidate) {
        for (const reaction of row.reactions) Object.freeze(reaction);
        Object.freeze(row.reactions);
        Object.freeze(row);
      }
      const snapshot = [...candidate];
      Object.freeze(snapshot);
      return snapshot;
    }));
    if (next === messages) return;
    messages = next;
    // Publication has committed. Listener failure cannot undo it or suppress peers.
    for (const listener of [...listeners]) {
      try { listener(); } catch (error) { errors.push(error); }
    }
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
        if (accepted >= MAX_TRANSITIONS) throw Error('Transcript transition limit exceeded; nested write rejected');
        accepted++;
        queued.push(update);
        return;
      }
      depth = 1;
      accepted = 1;
      const errors: unknown[] = [];
      queued.push(update);
      try {
        while (queued.length) {
          try { run(queued.shift()!, errors); } catch (error) { errors.push(error); }
        }
      } finally {
        depth = 0;
        accepted = 0;
        queued.length = 0;
      }
      if (errors.length) throw new AggregateError(errors, 'Transcript transition or notification failed');
    },
  };
}
