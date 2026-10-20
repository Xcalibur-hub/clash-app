/** Overflow recovery is acknowledged only after authoritative loaded coverage. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createReactionQueue } from './reactionOptimism.ts';
import { recoverOverflowAfterRefresh } from './overflowRecovery.ts';

describe('overflow recovery contract', () => {
  it('keeps the request through cancellation and failure, then acks on coverage', async () => {
    let online = false;
    const queue = createReactionQueue({
      read: async () => { if (!online) throw new Error('offline'); return [{ emoji: '🔥', count: 1, viewerReacted: true }]; },
      toggle: async () => { throw new Error('timeout'); },
      write: () => {},
      onError: () => {},
    });
    await Promise.all(Array.from({ length: 101 }, (_, i) => queue.enqueue(`m-${i}`, '🔥', () => true)));
    assert.equal(queue.pendingRepairs(), 100, 'retention bounded');
    assert.equal(queue.overflow().requested, true);
    assert.ok(queue.overflow().tracked >= 1, 'dropped ids are tracked for targeted recovery');

    const loaded = new Set(['m-0']);
    const isLoaded = (id: string): boolean => loaded.has(id);
    // Cancelled refresh never acknowledges.
    assert.equal(await recoverOverflowAfterRefresh({ queue, isLoaded, active: () => false }), false);
    assert.equal(queue.overflow().requested, true);
    // Offline: reads fail, so the request survives.
    assert.equal(await recoverOverflowAfterRefresh({ queue, isLoaded, active: () => true }), false);
    assert.equal(queue.overflow().requested, true);
    // Reconnect: loaded target is read and the request is acknowledged.
    online = true;
    assert.equal(await recoverOverflowAfterRefresh({ queue, isLoaded, active: () => true }), true);
    assert.equal(queue.overflow().requested, false);
  });

  it('parks unloaded targets without blocking acknowledgement (documented)', async () => {
    const queue = createReactionQueue({
      read: async () => [{ emoji: '🔥', count: 2, viewerReacted: true }],
      toggle: async () => { throw new Error('timeout'); },
      write: () => {},
      onError: () => {},
    });
    await Promise.all(Array.from({ length: 101 }, (_, i) => queue.enqueue(`m-${i}`, '🔥', () => true)));
    const acked = await recoverOverflowAfterRefresh({ queue, isLoaded: () => false, active: () => true });
    assert.equal(acked, true, 'unloaded work is parked, not silently repaired');
    assert.equal(queue.overflow().requested, false);
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
    assert.deepEqual(queue.overflow(), { dropped: 0, requested: false, tracked: 0 });
  });
});
