/** Post-fix: overflow recovery order, coverage deficit, scope safety, eviction floor. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createReactionQueue } from './reactionOptimism.ts';
import { createReactionSnapshots } from './reactionSnapshots.ts';
import { recoverOverflowAfterRefresh } from './overflowRecovery.ts';
import type { ArenaReaction } from '../services/liveArenaService.ts';

const zero: ArenaReaction[] = [{ emoji: '🔥', count: 0, viewerReacted: false }];
type Row = { id: string; createdAt: number; body: string; reactions: ArenaReaction[] };
const row = (id: string, count: number, body = 'local'): Row => ({ id, createdAt: 1, body, reactions: [{ emoji: '🔥', count, viewerReacted: true }] });
const offlineQueue = () => createReactionQueue({ read: async () => { throw new Error('offline'); }, toggle: async () => { throw new Error('timeout'); }, write: () => {}, onError: () => {} });

describe('F1 recovery ordering', () => {
  it('never overwrites a newer successful toggle and clears the obligation', async () => {
    let offline = true, defer = false, release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const writes: number[] = [];
    const queue = createReactionQueue({
      read: async () => {
        if (offline) throw new Error('offline');
        if (defer) { defer = false; await gate; return zero; }
        return zero;
      },
      toggle: async () => ({ messageId: 'm-0', emoji: '🔥', reacted: true, count: 1 }),
      write: (_id, rows) => { if (rows) writes.push(rows.find((r) => r.emoji === '🔥')?.count ?? -1); },
      onError: () => {},
    });
    await Promise.all(Array.from({ length: 101 }, (_, i) => queue.enqueue(`m-${i}`, '🔥', () => true)));
    offline = false; defer = true;
    const recovery = queue.recoverDropped({ isLoaded: () => true, loadedIds: [], active: () => true, generation: 1, currentGeneration: () => 1 });
    await Promise.resolve();
    await queue.enqueue('m-0', '🔥', () => true);
    release();
    const result = await recovery;
    assert.equal(writes.at(-1), 1, 'stale read discarded');
    assert.equal(result.remainingLoaded, 0, 'newer write satisfies the obligation');
  });
});

describe('F2 coverage deficit', () => {
  it('never acknowledges while a forgotten loaded target remains, then sweeps', async () => {
    let online = false;
    const queue = createReactionQueue({
      read: async () => { if (!online) throw new Error('offline'); return zero; },
      toggle: async () => { throw new Error('timeout'); },
      write: () => {},
      onError: () => {},
    });
    await Promise.all(Array.from({ length: 151 }, (_, i) => queue.enqueue(`m-${i}`, '🔥', () => true)));
    assert.equal(queue.pendingRepairs(), 100);
    assert.ok(queue.overflow().deficit >= 1, 'forgotten target is not silently dropped');

    const base = { queue, isLoaded: (id: string) => id === 'm-50', loadedIds: ['m-0', 'm-50'], active: () => true, generation: 1, currentGeneration: () => 1 };
    assert.equal(await recoverOverflowAfterRefresh(base), false, 'offline does not acknowledge');
    assert.equal(queue.overflow().requested, true);
    online = true;
    assert.equal(await recoverOverflowAfterRefresh(base), true, 'loaded sweep clears the deficit');
    assert.equal(queue.overflow().deficit, 0);
  });
});

describe('F3 scope cancellation', () => {
  it('performs no late write or acknowledgement after invalidation', async () => {
    let offline = true, defer = false, release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let active = true;
    const writes: number[] = [];
    const queue = createReactionQueue({
      read: async () => {
        if (offline) throw new Error('offline');
        if (defer) { defer = false; await gate; return zero; }
        return zero;
      },
      toggle: async () => { throw new Error('timeout'); },
      write: (_id, rows) => { if (rows) writes.push(rows.length); },
      onError: () => {},
    });
    await Promise.all(Array.from({ length: 101 }, (_, i) => queue.enqueue(`m-${i}`, '🔥', () => true)));
    offline = false; defer = true;
    const recovery = recoverOverflowAfterRefresh({ queue, isLoaded: () => true, loadedIds: ['m-0'], active: () => active, generation: 1, currentGeneration: () => 1 });
    await Promise.resolve();
    active = false;
    const before = writes.length;
    release();
    assert.equal(await recovery, false);
    assert.equal(writes.length, before, 'no late write');
  });
});

describe('F4 eviction floor', () => {
  it('survives recreation by a failed mutation and still accepts fresh snapshots', () => {
    const guard = createReactionSnapshots();
    const stale = guard.beginSnapshot();
    guard.beginMutation('old'); guard.commitMutation('old');
    for (let i = 0; i < 256; i += 1) { const id = `x-${i}`; guard.merge([row(id, 1)], [row(id, 2)], guard.beginSnapshot()); }
    guard.beginMutation('old'); guard.finishMutation('old');
    assert.equal(guard.merge([row('old', 9)], [row('old', 2, 'server body')], stale)[0].reactions[0].count, 9);
    const fresh = guard.merge([row('old', 9)], [row('old', 3)], guard.beginSnapshot());
    assert.equal(fresh[0].reactions[0].count, 3);
    guard.reset();
    assert.equal(guard.merge([row('old', 9)], [row('old', 4)], stale)[0].reactions[0].count, 4);
  });
});
