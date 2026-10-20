/** Post-fix: mutation ownership and snapshot-guard eviction invariants. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createReactionSnapshots } from './reactionSnapshots.ts';
import { createRoomReactionBridge } from './roomReactionBridge.ts';
import type { ArenaReaction } from '../services/liveArenaService.ts';

type Row = { id: string; createdAt: number; body: string; reactions: ArenaReaction[] };
const row = (id: string, count: number, body = 'local', reacted = true): Row => ({
  id, createdAt: 1, body, reactions: [{ emoji: '🔥', count, viewerReacted: reacted }],
});

describe('two queued toggles on one message', () => {
  it('keeps the second selection pending while the first succeeds', async () => {
    const guard = createReactionSnapshots();
    let calls = 0;
    let releaseSecond!: () => void;
    const gate = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const bridge = createRoomReactionBridge({
      snapshots: guard,
      read: async () => [{ emoji: '🔥', count: 3, viewerReacted: true }],
      toggle: async () => {
        calls += 1;
        if (calls === 1) return { messageId: 'm1', emoji: '🔥', reacted: true, count: 3 };
        await gate;
        return { messageId: 'm1', emoji: '🔥', reacted: true, count: 4 };
      },
      write: () => {},
      onError: () => {},
    });

    guard.beginMutation('m1');
    const first = bridge.enqueue('m1', '🔥', () => true).finally(() => guard.finishMutation('m1'));
    guard.beginMutation('m1');
    const second = bridge.enqueue('m1', '🔥', () => true).finally(() => guard.finishMutation('m1'));

    await first;
    assert.deepEqual(guard.protectedIds(), ['m1'], 'second toggle still owns the message');
    const during = guard.merge([row('m1', 4)], [row('m1', 1, 'server body', false)], guard.beginSnapshot());
    assert.equal(during[0].reactions[0].count, 4, 'unresolved toggle is protected');
    assert.equal(during[0].body, 'server body');

    releaseSecond();
    await second;
    const after = guard.merge([row('m1', 4)], [row('m1', 6, 'fresh', true)], guard.beginSnapshot());
    assert.equal(after[0].reactions[0].count, 6, 'newer authority is adoptable after completion');
  });
});

describe('snapshot guard eviction', () => {
  it('rejects an old snapshot after eviction and still accepts fresh ones', () => {
    const guard = createReactionSnapshots();
    const stale = guard.beginSnapshot();
    guard.beginMutation('old');
    guard.commitMutation('old');
    for (let i = 0; i < 256; i += 1) {
      const id = `x-${i}`;
      guard.merge([row(id, 1)], [row(id, 2)], guard.beginSnapshot());
    }
    const merged = guard.merge([row('old', 9)], [row('old', 2, 'server body', false)], stale);
    assert.equal(merged[0].reactions[0].count, 9, 'stale rejected after eviction');
    assert.equal(merged[0].body, 'server body');
    const fresh = guard.merge([row('old', 9)], [row('old', 3, 'fresh', true)], guard.beginSnapshot());
    assert.equal(fresh[0].reactions[0].count, 3, 'fresh snapshot can update reactions');
  });
});
