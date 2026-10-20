/** Behavioral coverage for membership, visibility admission and send scoping. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createReactionSnapshots } from './reactionSnapshots.ts';
import {
  createVisibilityBarrier,
  isCurrentScope,
  mergeInitialPage,
  mergePostedRow,
  resolveSendResolution,
} from './transcriptOrdering.ts';
import type { ArenaReaction } from '../services/liveArenaService.ts';

type Row = { id: string; createdAt: number; body: string; pending?: boolean; reactions: ArenaReaction[] };
const row = (id: string, count: number, reacted = false, body = 'body', pending = false): Row => ({
  id, createdAt: 1, body, pending, reactions: [{ emoji: 'fire', count, viewerReacted: reacted }],
});
const fire = (rows: readonly Row[], id: string): number | null =>
  rows.find((r) => r.id === id)?.reactions[0]?.count ?? null;

describe('F1 initial membership', () => {
  it('keeps hydration, history and pending rows absent from the bounded page', () => {
    const guard = createReactionSnapshots();
    const snapshot = guard.beginSnapshot();
    guard.beginMutation('m1');
    guard.markAuthoritativeReactionWrite('m1');
    guard.finishMutation('m1');
    const cache = [row('m1', 1, true, 'hydrated'), row('history', 4), row('temp', 0, false, 'pending', true)];
    const out = mergeInitialPage(cache, [row('m1', 0, false, 'page'), row('m2', 2), row('m2', 2)], snapshot, guard);
    assert.equal(fire(out, 'm1'), 1);
    assert.equal(out.find((r) => r.id === 'm1')?.reactions[0]?.viewerReacted, true);
    assert.equal(out.find((r) => r.id === 'm1')?.body, 'page');
    assert.equal(out.some((r) => r.id === 'history'), true, 'history outside the page survives');
    assert.equal(out.some((r) => r.id === 'temp'), true, 'pending placeholder survives');
    assert.equal(new Set(out.map((r) => r.id)).size, out.length, 'no duplicate ids');
  });
});

describe('F2 bounded visibility protection', () => {
  it('still rejects an old request after the eviction record is pruned', () => {
    const barrier = createVisibilityBarrier(8);
    const oldEpoch = barrier.epoch();
    barrier.mark(['m']);
    for (let i = 0; i < 20; i += 1) barrier.mark(['x' + i]);
    assert.equal(barrier.allows(oldEpoch), false, 'watermark refuses pre-eviction requests');
    assert.deepEqual(barrier.admit([row('m')], oldEpoch), []);
    assert.deepEqual(barrier.admit([row('m')], barrier.epoch()).map((r) => r.id), ['m'], 'later request may reintroduce');
  });

  it('keeps multiple pending requests and ordinary absence unaffected', () => {
    const barrier = createVisibilityBarrier();
    const a = barrier.epoch();
    const b = barrier.epoch();
    barrier.mark(['m']);
    assert.deepEqual(barrier.admit([row('m')], a), []);
    assert.deepEqual(barrier.admit([row('m')], b), []);
    assert.deepEqual(barrier.admit([row('other')], a).map((r) => r.id), ['other']);
    assert.deepEqual(createVisibilityBarrier().admit([row('m')], 0).map((r) => r.id), ['m']);
  });
});

describe('F3 unified admission', () => {
  it('blocks a row from any path whose request predates the eviction', () => {
    const barrier = createVisibilityBarrier();
    const started = barrier.epoch();
    barrier.mark(['m']);
    for (const label of ['initial', 'refresh', 'pagination', 'hydrate', 'post']) {
      assert.deepEqual(barrier.admit([row('m', 3, true, label)], started), [], label);
    }
    assert.equal(barrier.admit([row('m')], barrier.epoch()).length, 1);
  });
});

describe('F4 send generation', () => {
  it('applies, clears and reports success only in the live scope', () => {
    assert.deepEqual(resolveSendResolution({ mounted: true, sentGeneration: 2, currentGeneration: 2 }), {
      applyRow: true, clearPlaceholder: true, reportSuccess: true,
    });
    assert.deepEqual(resolveSendResolution({ mounted: true, sentGeneration: 2, currentGeneration: 3 }), {
      applyRow: false, clearPlaceholder: false, reportSuccess: false,
    });
    assert.deepEqual(resolveSendResolution({ mounted: false, sentGeneration: 2, currentGeneration: 2 }), {
      applyRow: false, clearPlaceholder: false, reportSuccess: false,
    });
    assert.equal(isCurrentScope(false, 1, 1), false);
    assert.equal(isCurrentScope(true, 1, 2), false, 'failed-send cleanup is scope-gated');
  });

  it('still merges a posted row that arrives inside the live scope', () => {
    const guard = createReactionSnapshots();
    const snapshot = guard.beginSnapshot();
    guard.beginMutation('s1');
    guard.markAuthoritativeReactionWrite('s1');
    guard.finishMutation('s1');
    const resolution = resolveSendResolution({ mounted: true, sentGeneration: 1, currentGeneration: 1 });
    const out = resolution.applyRow && resolution.clearPlaceholder
      ? mergePostedRow([row('s1', 1, true), row('temp', 0, false, 'p', true)], row('s1', 0, false, 'posted'), 'temp', snapshot, guard)
      : [];
    assert.equal(fire(out, 's1'), 1);
    assert.equal(out.some((r) => r.id === 'temp'), false);
  });
});
