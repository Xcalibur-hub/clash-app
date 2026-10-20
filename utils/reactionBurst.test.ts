/**
 * Reaction burst replay guards. The Stage must burst once per real count rise,
 * never on paint, never twice for the same authoritative key.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { reactionBurstFor, type ReactionCount } from '../components/liveArena/liveArenaStyles.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

const rows = (emoji: string, count: number): ReactionCount[] => [{ emoji, count }];

describe('reaction burst replay', () => {
  it('never bursts on the first observation of a message', () => {
    assert.equal(reactionBurstFor(null, rows('🔥', 3), 'm1'), null);
  });

  it('bursts once when a real count rises', () => {
    const signal = reactionBurstFor(rows('🔥', 2), rows('🔥', 3), 'm1');
    assert.equal(signal?.emoji, '🔥');
    assert.equal(signal?.key, 'm1:🔥:3');
  });

  it('ignores unchanged, decreasing and empty counts', () => {
    assert.equal(reactionBurstFor(rows('🔥', 3), rows('🔥', 3), 'm1'), null);
    assert.equal(reactionBurstFor(rows('🔥', 4), rows('🔥', 3), 'm1'), null);
    assert.equal(reactionBurstFor(rows('🔥', 1), [], 'm1'), null);
  });

  it('produces a stable key for a replayed event', () => {
    const first = reactionBurstFor(rows('🔥', 2), rows('🔥', 3), 'm1');
    const replay = reactionBurstFor(rows('🔥', 2), rows('🔥', 3), 'm1');
    assert.equal(first?.key, replay?.key);
  });

  it('never emits a tally, only the emoji', () => {
    const signal = reactionBurstFor(rows('😂', 5), rows('😂', 9), 'm2');
    assert.deepEqual(Object.keys(signal ?? {}).sort(), ['emoji', 'key']);
  });

  it('requires a message identity', () => {
    assert.equal(reactionBurstFor(rows('🔥', 1), rows('🔥', 2), null), null);
  });

  it('never lets the room hook invent a reaction total locally', () => {
    const src = fs.readFileSync(path.join(here, '../hooks/useLiveArenaRoom.ts'), 'utf8');
    // The optimistic step flips only viewerReacted; the count stays server-owned.
    assert.doesNotMatch(src, /count\s*\+\s*1/);
    assert.match(src, /reactionSequence/);
  });
});
