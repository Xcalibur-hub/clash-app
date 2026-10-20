/** Behavioral coverage for initial-page, posted-row and visibility ordering. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createReactionSnapshots } from './reactionSnapshots.ts';
import { createVisibilityBarrier, mergeInitialPage, mergePostedRow } from './transcriptOrdering.ts';
import type { ArenaReaction } from '../services/liveArenaService.ts';

type Row = { id: string; createdAt: number; body: string; pending?: boolean; reactions: ArenaReaction[] };
const row = (id: string, count: number, reacted = false, body = 'body', pending = false): Row => ({
  id, createdAt: 1, body, pending, reactions: [{ emoji: '🔥', count, viewerReacted: reacted }],
});
const fire = (rows: readonly Row[], id: string): number | null =>
  rows.find((r) => r.id === id)?.reactions.find((x) => x.emoji === '🔥')?.count ?? null;
const selected = (rows: readonly Row[], id: string): boolean | null =>
  rows.find((r) => r.id === id)?.reactions.find((x) => x.emoji === '🔥')?.viewerReacted ?? null;

describe('F1 initial load ordering', () => {
  it('keeps newer reactions, drops stale rows, keeps pending rows', () => {
    const guard = createReactionSnapshots();
    const snapshot = guard.beginSnapshot();
    // Hydration inserted M and a reaction completed while the initial page was in flight.
    guard.beginMutation('m1');
    guard.markAuthoritativeReactionWrite('m1');
    guard.finishMutation('m1');
    const cache = [row('m1', 1, true, 'local', false), row('stale', 5), row('temp', 0, false, 'pending', true)];
    const out = mergeInitialPage(cache, [row('m1', 0, false, 'server edited'), row('m2', 2)], snapshot, guard);
    assert.equal(fire(out, 'm1'), 1);
    assert.equal(selected(out, 'm1'), true);
    assert.equal(out.find((r) => r.id === 'm1')?.body, 'server edited');
    assert.equal(out.some((r) => r.id === 'stale'), false, 'rows outside the authoritative page are dropped');
    assert.equal(out.some((r) => r.id === 'temp'), true, 'pending placeholder retained');
    assert.equal(out.filter((r) => r.id === 'm1').length, 1);
  });
});

describe('F2 posting response ordering', () => {
  it('keeps newer reactions, removes the placeholder and never duplicates', () => {
    const guard = createReactionSnapshots();
    const snapshot = guard.beginSnapshot();
    guard.beginMutation('server-1');
    guard.markAuthoritativeReactionWrite('server-1');
    guard.finishMutation('server-1');
    const cache = [row('server-1', 1, true, 'hydrated'), row('temp-1', 0, false, 'pending', true)];
    const out = mergePostedRow(cache, row('server-1', 0, false, 'posted'), 'temp-1', snapshot, guard);
    assert.equal(fire(out, 'server-1'), 1);
    assert.equal(selected(out, 'server-1'), true);
    assert.equal(out.some((r) => r.id === 'temp-1'), false);
    assert.equal(out.filter((r) => r.id === 'server-1').length, 1);
    assert.equal(out.find((r) => r.id === 'server-1')?.body, 'posted');
  });
});

describe('F3 visibility eviction', () => {
  it('blocks older hydration but allows a later authorized request', () => {
    const barrier = createVisibilityBarrier();
    const fetchEpoch = barrier.epoch();
    barrier.mark(['m1']);
    assert.deepEqual(barrier.filter([row('m1', 9), row('m2', 1)], fetchEpoch).map((r) => r.id), ['m2']);
    const later = barrier.epoch();
    assert.deepEqual(barrier.filter([row('m1', 0), row('m2', 1)], later).map((r) => r.id), ['m1', 'm2']);
  });

  it('does not treat ordinary pagination as eviction', () => {
    const barrier = createVisibilityBarrier();
    const epoch = barrier.epoch();
    assert.deepEqual(barrier.filter([row('older', 1)], epoch).map((r) => r.id), ['older']);
  });
});

describe('F4 scope invalidation', () => {
  it('never mutates inputs and keeps barriers scope-local', () => {
    const guard = createReactionSnapshots();
    const cache = [row('m1', 3, true)];
    const snapshot = guard.beginSnapshot();
    guard.reset();
    const out = mergeInitialPage(cache, [row('m1', 0)], snapshot, guard);
    assert.equal(fire(cache, 'm1'), 3, 'input untouched');
    assert.equal(out.length, 1);
    const barrier = createVisibilityBarrier();
    barrier.mark(['m1']);
    assert.deepEqual(barrier.filter([row('m1', 1)], Number.MAX_SAFE_INTEGER).map((r) => r.id), ['m1']);
  });
});
