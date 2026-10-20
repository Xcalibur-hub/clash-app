/** Reaction race guards: rapid taps, rejection rollback, authoritative merge. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyOptimisticReaction,
  mergeReactionResult,
  reactionSequenceAccepted,
  restoreReactions,
} from './reactionOptimism.ts';
import type { ArenaReaction } from '../services/liveArenaService';

const rows = (): ArenaReaction[] => [
  { emoji: '🔥', count: 4, viewerReacted: false },
  { emoji: '😂', count: 2, viewerReacted: true },
];

describe('optimistic reactions', () => {
  it('toggles only the viewer selection, never the total', () => {
    const next = applyOptimisticReaction(rows(), '🔥');
    assert.equal(next.find((row) => row.emoji === '🔥')?.viewerReacted, true);
    assert.equal(next.find((row) => row.emoji === '🔥')?.count, 4);
  });

  it('adds an unseen emoji with no displayed total', () => {
    const next = applyOptimisticReaction(rows(), '💀');
    const added = next.find((row) => row.emoji === '💀');
    assert.equal(added?.count, 0);
    assert.equal(added?.viewerReacted, true);
  });

  it('restores the exact prior rows when the request is rejected', () => {
    const prior = rows();
    const optimistic = applyOptimisticReaction(prior, '🔥');
    const restored = restoreReactions(prior);
    assert.deepEqual(restored, prior);
    assert.notDeepEqual(restored, optimistic);
  });

  it('returns null when there was nothing to restore', () => {
    assert.equal(restoreReactions(null), null);
  });

  it('accepts only the newest tap per message', () => {
    assert.equal(reactionSequenceAccepted(2, 2), true);
    assert.equal(reactionSequenceAccepted(2, 1), false);
    assert.equal(reactionSequenceAccepted(undefined, 1), false);
  });

  it('keeps a rapid second tap when the first response is older', () => {
    const latest = 2; // second tap owns the message
    assert.equal(reactionSequenceAccepted(latest, 1), false);
    assert.equal(reactionSequenceAccepted(latest, 2), true);
  });

  it('applies the server total and drops a cleared reaction', () => {
    const merged = mergeReactionResult(rows(), { emoji: '🔥', count: 5, reacted: true });
    assert.equal(merged.find((row) => row.emoji === '🔥')?.count, 5);
    const cleared = mergeReactionResult(merged, { emoji: '🔥', count: 0, reacted: false });
    assert.equal(cleared.some((row) => row.emoji === '🔥'), false);
    assert.equal(cleared.some((row) => row.emoji === '😂'), true);
  });

  it('sorts by authoritative count then emoji', () => {
    const merged = mergeReactionResult(rows(), { emoji: '👏', count: 9, reacted: true });
    assert.deepEqual(merged.map((row) => row.emoji), ['👏', '🔥', '😂']);
  });

  it('never produces a negative or fractional total', () => {
    for (const count of [0, 1, 12]) {
      const merged = mergeReactionResult(rows(), { emoji: '💀', count, reacted: true });
      assert.ok(merged.every((row) => Number.isInteger(row.count) && row.count >= 0));
    }
  });
});
