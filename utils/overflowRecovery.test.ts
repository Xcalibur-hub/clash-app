/** Overflow recovery: scope-aware acknowledgement and bounded coverage. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createReactionQueue } from './reactionOptimism.ts';
import { recoverOverflowAfterRefresh } from './overflowRecovery.ts';

const scope = (online: () => boolean, active: () => boolean, generation = 1) => ({
  active,
  generation,
  currentGeneration: () => (active() ? generation : generation + 1),
});

describe('overflow recovery contract', () => {
  it('keeps the request through cancellation and failure, then acks on coverage', async () => {
    let online = false;
    let active = true;
    const queue = createReactionQueue({
      read: async () => { if (!online) throw new Error('offline'); return [{ emoji: '🔥', count: 1, viewerReacted: true }]; },
      toggle: async () => { throw new Error('timeout'); },
      write: () => {},
      onError: () => {},
    });
    await Promise.all(Array.from({ length: 101 }, (_, i) => queue.enqueue(`m-${i}`, '🔥', () => true)));
    assert.equal(queue.pendingRepairs(), 100);
    assert.equal(queue.overflow().requested, true);

    const isLoaded = (id: string): boolean => id === 'm-0';
    const loadedIds = ['m-0'];
    const call = () => recoverOverflowAfterRefresh({ queue, isLoaded, loadedIds, ...scope(() => online, () => active) });

    active = false;
    assert.equal(await call(), false, 'cancelled scope never acknowledges');
    active = true;
    assert.equal(await call(), false, 'offline keeps the request');
    assert.equal(queue.overflow().requested, true);
    online = true;
    assert.equal(await call(), true, 'loaded coverage acknowledges');
    assert.equal(queue.overflow().requested, false);
  });

  it('parks unloaded targets without claiming individual repair', async () => {
    const queue = createReactionQueue({
      read: async () => [{ emoji: '🔥', count: 2, viewerReacted: true }],
      toggle: async () => { throw new Error('timeout'); },
      write: () => {},
      onError: () => {},
    });
    await Promise.all(Array.from({ length: 101 }, (_, i) => queue.enqueue(`m-${i}`, '🔥', () => true)));
    const acked = await recoverOverflowAfterRefresh({ queue, isLoaded: () => false, loadedIds: [], ...scope(() => true, () => true) });
    assert.equal(acked, true);
    assert.ok(queue.overflow().tracked >= 1, 'parked ids remain tracked, not reported repaired');
  });

  it('resets on room or account disposal', async () => {
    const queue = createReactionQueue({
      read: async () => { throw new Error('offline'); },
      toggle: async () => { throw new Error('timeout'); },
      write: () => {},
      onError: () => {},
    });
    await Promise.all(Array.from({ length: 101 }, (_, i) => queue.enqueue(`m-${i}`, '🔥', () => true)));
    queue.reset();
    assert.equal(queue.pendingRepairs(), 0);
    assert.deepEqual(queue.overflow(), { dropped: 0, requested: false, tracked: 0, deficit: 0 });
  });
});
