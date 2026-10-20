/** Bounded ambiguous-repair retention: 100 failures, then repeated cycles. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createReactionQueue } from './reactionOptimism.ts';

describe('reaction repair retention', () => {
  it('drains 100 ambiguous targets without endless rereads or retoggles', async () => {
    const reads = new Map<string, number>();
    const toggles: string[] = [];
    const queue = createReactionQueue({
      read: async (id) => {
        reads.set(id, (reads.get(id) ?? 0) + 1);
        return [{ emoji: '🔥', count: 1, viewerReacted: false }];
      },
      toggle: async (id) => { toggles.push(id); throw new Error('timeout'); },
      write: () => {},
      onError: () => {},
    });

    await Promise.all(Array.from({ length: 100 }, (_, i) => queue.enqueue(`m-${i}`, '🔥', () => true)));
    assert.equal(toggles.length, 100, 'each tap is attempted exactly once');
    assert.ok(queue.pendingRepairs() <= 100);

    for (let cycle = 0; cycle < 12; cycle += 1) await queue.reconcile();

    assert.equal(queue.pendingRepairs(), 0, 'retained map drains');
    assert.ok(Math.max(...[...reads.values()]) <= 3, 'each target is read a bounded number of times');
    assert.equal(toggles.length, 100, 'repair never retries a non-idempotent toggle');
  });

  it('drops every retained target on a scope reset', async () => {
    const queue = createReactionQueue({
      read: async () => [{ emoji: '🔥', count: 0, viewerReacted: false }],
      toggle: async () => { throw new Error('timeout'); },
      write: () => {},
      onError: () => {},
    });
    await Promise.all([0, 1, 2].map((i) => queue.enqueue(`m-${i}`, '🔥', () => true)));
    assert.ok(queue.pendingRepairs() > 0);
    queue.reset();
    assert.equal(queue.pendingRepairs(), 0);
  });

  it('bounds 101 ambiguous targets without marking them repaired', async () => {
    const queue = createReactionQueue({
      read: async () => { throw new Error('offline'); },
      toggle: async () => { throw new Error('timeout'); },
      write: () => {},
      onError: () => {},
    });
    await Promise.all(Array.from({ length: 101 }, (_, i) => queue.enqueue(`m-${i}`, '🔥', () => true)));

    assert.equal(queue.pendingRepairs(), 100, 'retention stays bounded');
    const overflow = queue.overflow();
    assert.ok(overflow.dropped >= 1, 'overflow is explicit');
    assert.equal(overflow.requested, true, 'a broader refresh is requested');

    // Offline cycles must not consume the obligation or claim repair.
    for (let cycle = 0; cycle < 4; cycle += 1) await queue.reconcile();
    assert.equal(queue.pendingRepairs(), 100);
    assert.ok(queue.overflow().dropped >= 1);

    // Reconnect: a single read confirms, a later pass deletes.
    let online = true;
    const connected = createReactionQueue({
      read: async () => { if (!online) throw new Error('offline'); return [{ emoji: '🔥', count: 1, viewerReacted: true }]; },
      toggle: async () => { throw new Error('timeout'); },
      write: () => {},
      onError: () => {},
    });
    for (const i of [0, 1, 2]) await connected.enqueue(`m-${i}`, '🔥', () => true);
    online = false;
    for (let cycle = 0; cycle < 3; cycle += 1) await connected.reconcile();
    assert.ok(connected.pendingRepairs() > 0, 'offline does not claim repair');
    online = true;
    for (let cycle = 0; cycle < 6; cycle += 1) await connected.reconcile();
    assert.equal(connected.pendingRepairs(), 0, 'reconnect drains retained targets');
  });
});
