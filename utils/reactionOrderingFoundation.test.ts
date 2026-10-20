/** Production-observable ordering tests for reaction-bearing write paths. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createReactionQueue } from './reactionOptimism.ts';
import { createRoomReactionBridge } from './roomReactionBridge.ts';
import { createReactionSnapshots } from './reactionSnapshots.ts';
import type { ArenaReaction } from '../services/liveArenaService.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
type Row = { id: string; createdAt: number; body: string; reactions: ArenaReaction[] };
const row = (id: string, count: number, reacted = false, body = 'body'): Row => ({
  id, createdAt: 1, body, reactions: [{ emoji: 'ðŸ”¥', count, viewerReacted: reacted }],
});
const countOf = (rows: readonly Row[], id: string): number | null =>
  rows.find((r) => r.id === id)?.reactions.find((x) => x.emoji === 'ðŸ”¥')?.count ?? null;
const reactedOf = (rows: readonly Row[], id: string): boolean | null =>
  rows.find((r) => r.id === id)?.reactions.find((x) => x.emoji === 'ðŸ”¥')?.viewerReacted ?? null;
const zero: ArenaReaction[] = [{ emoji: 'ðŸ”¥', count: 0, viewerReacted: false }];

function cache(initial: Row[]) {
  let rows = initial;
  const writes: { id: string; rows: ArenaReaction[] | null }[] = [];
  return {
    get rows() { return rows; }, writes,
    write(id: string, reactions: ArenaReaction[] | null): void {
      writes.push({ id, rows: reactions ? reactions.map((r) => ({ ...r })) : null });
      rows = reactions ? rows.map((r) => (r.id === id ? { ...r, reactions } : r)) : rows.filter((r) => r.id !== id);
    },
    merge(next: Row[], snapshot: number, guard: ReturnType<typeof createReactionSnapshots>): void {
      rows = guard.merge(rows, next, snapshot);
    },
  };
}
const seed = async (queue: ReturnType<typeof createReactionQueue>, n = 101) => {
  await Promise.all(Array.from({ length: n }, (_, i) => queue.enqueue(`m-${i}`, 'ðŸ”¥', () => true)));
};

describe('1. newer toggle outranks an older recovery read', () => {
  it('keeps the newer count and selection in the cache', async () => {
    let offline = true, defer = false, release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const c = cache([row('m-0', 0)]);
    let toggles = 0;
    const queue = createReactionQueue({
      read: async (id) => {
        if (offline) throw new Error('offline');
        if (defer && id === 'm-0') { defer = false; await gate; return zero; }
        return zero;
      },
      toggle: async () => { toggles += 1; return { messageId: 'm-0', emoji: 'ðŸ”¥', reacted: true, count: 1 }; },
      write: (id, reactions) => c.write(id, reactions), onError: () => {},
    });
    await seed(queue);
    offline = false; defer = true;
    const recovery = queue.recoverDropped({ isLoaded: () => true, loadedIds: ['m-0'], active: () => true, generation: 1, currentGeneration: () => 1 });
    await Promise.resolve();
    await queue.enqueue('m-0', 'ðŸ”¥', () => true);
    release();
    await recovery;
    assert.equal(toggles, 1);
    assert.equal(countOf(c.rows, 'm-0'), 1);
    assert.equal(reactedOf(c.rows, 'm-0'), true);
  });
});

describe('2. two toggles serialize and finish exactly once', () => {
  it('runs in tap order with one finish per mutation', async () => {
    const c = cache([row('m1', 0)]);
    let finishes = 0;
    const guard = createReactionSnapshots();
    const tracked = { ...guard, finishMutation: (id: string) => { finishes += 1; guard.finishMutation(id); } };
    const order: number[] = [];
    let calls = 0;
    const bridge = createRoomReactionBridge({
      snapshots: tracked, read: async () => zero,
      toggle: async () => { calls += 1; order.push(calls); return { messageId: 'm1', emoji: 'ðŸ”¥', reacted: true, count: calls }; },
      write: (id, reactions) => c.write(id, reactions), onError: () => {},
    });
    guard.beginMutation('m1');
    const first = bridge.enqueue('m1', 'ðŸ”¥', () => true).finally(() => tracked.finishMutation('m1'));
    guard.beginMutation('m1');
    const second = bridge.enqueue('m1', 'ðŸ”¥', () => true).finally(() => tracked.finishMutation('m1'));
    await Promise.all([first, second]);
    assert.deepEqual(order, [1, 2]);
    assert.equal(finishes, 2);
    assert.equal(countOf(c.rows, 'm1'), 2);
  });
});

describe('3. lost response is repaired, never replayed', () => {
  it('reads the committed count without a second toggle', async () => {
    const c = cache([row('m1', 0)]);
    let toggles = 0, reads = 0;
    const queue = createReactionQueue({
      read: async () => { reads += 1; return reads === 1 ? zero : [{ emoji: 'ðŸ”¥', count: 1, viewerReacted: true }]; },
      toggle: async () => { toggles += 1; throw new Error('lost response'); },
      write: (id, reactions) => c.write(id, reactions), onError: () => {},
    });
    await queue.enqueue('m1', 'ðŸ”¥', () => true);
    await queue.reconcile();
    assert.equal(toggles, 1, 'no automatic replay');
    assert.equal(countOf(c.rows, 'm1'), 1);
    assert.equal(reactedOf(c.rows, 'm1'), true);
  });
});
describe('4. invalidated scope applies no stale write', () => {
  it('drops a read that resolves after generation invalidation', async () => {
    let defer = false, release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let active = true;
    const c = cache([row('m-0', 0)]);
    const queue = createReactionQueue({
      read: async (id) => {
        if (id === 'm-0' && defer) { defer = false; await gate; return [{ emoji: 'ðŸ”¥', count: 9, viewerReacted: true }]; }
        if (!active) throw new Error('offline');
        return zero;
      },
      toggle: async () => { throw new Error('timeout'); },
      write: (id, reactions) => c.write(id, reactions), onError: () => {},
    });
    await seed(queue);
    defer = true;
    const recovery = queue.recoverDropped({ isLoaded: () => true, loadedIds: ['m-0'], active: () => active, generation: 1, currentGeneration: () => 1 });
    await Promise.resolve();
    active = false;
    const before = c.writes.length;
    release();
    const result = await recovery;
    assert.ok(result.remainingLoaded > 0);
    assert.equal(c.writes.length, before, 'no write after invalidation');
    assert.equal(countOf(c.rows, 'm-0'), 0);
  });
});

describe('5. stale transcript snapshot preserves reactions but merges body', () => {
  it('keeps the mutated reaction and applies the newer body', () => {
    const guard = createReactionSnapshots();
    const c = cache([row('m1', 4, true, 'local body')]);
    const snapshot = guard.beginSnapshot();
    guard.beginMutation('m1');
    guard.markAuthoritativeReactionWrite('m1');
    guard.finishMutation('m1');
    c.merge([row('m1', 1, false, 'server body')], snapshot, guard);
    assert.equal(countOf(c.rows, 'm1'), 4);
    assert.equal(reactedOf(c.rows, 'm1'), true);
    assert.equal(c.rows[0].body, 'server body');
  });
});

describe('6. every reaction-bearing transcript path uses the coordinator', () => {
  it('guards every transcript path through the coordinator and admission', () => {
    const src = fs.readFileSync(path.join(here, '../hooks/useLiveArenaRoom.ts'), 'utf8');
    const hydrate = src.slice(src.indexOf('const hydrateInserted'), src.indexOf('const refreshThread'));
    const needles = [
      'reactionSnapshots.current.merge(',
      'visibilityBarrier.admit(',
      'mergeInitialPage(current, admittedThread',
      'admit(page,pageEpoch)',
      'admit(rows,threadEpoch)',
      'resolveSendResolution(',
    ];
    for (const needle of needles) assert.ok(src.includes(needle), needle);
    assert.ok(hydrate.includes('beginSnapshot()'));
    assert.ok(hydrate.includes('visibilityBarrier.admit(next, visibilityEpoch)'));
    assert.ok(!hydrate.includes('mergeMessages(current, next)'));
  });
});

describe('7. reaction-only reads cannot resurrect a deleted message', () => {
  it('removes the row when the authoritative read returns null', async () => {
    const c = cache([row('gone', 2, true), row('stay', 1)]);
    const queue = createReactionQueue({
      read: async (id) => (id === 'gone' ? null : zero),
      toggle: async () => ({ messageId: 'gone', emoji: 'ðŸ”¥', reacted: true, count: 3 }),
      write: (id, reactions) => c.write(id, reactions), onError: () => {},
    });
    await queue.enqueue('gone', 'ðŸ”¥', () => true);
    await queue.reconcile();
    assert.equal(c.rows.some((r) => r.id === 'gone'), false);
    assert.equal(c.rows.some((r) => r.id === 'stay'), true);
  });
});





