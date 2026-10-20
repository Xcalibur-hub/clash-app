/** Snapshot ordering guards: an older snapshot never overwrites a newer reaction. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createReactionSnapshots } from './reactionSnapshots.ts';

type Row = { id: string; createdAt: number; body: string; reactions: { emoji: string; count: number; viewerReacted: boolean }[] };

const row = (id: string, count: number, body = 'server body', reacted = false): Row => ({
  id,
  createdAt: 1,
  body,
  reactions: [{ emoji: '🔥', count, viewerReacted: reacted }],
});

describe('reaction snapshot ordering', () => {
  it('keeps the post-mutation reaction when an earlier snapshot resolves later', () => {
    const guard = createReactionSnapshots();
    const current = [row('m1', 5, 'local body', true)];
    const snapshot = guard.beginSnapshot();       // transcript refresh starts
    guard.noteMutation('m1');                     // toggle succeeds
    const stale = [row('m1', 4, 'server body')];  // older server state arrives
    const merged = guard.merge(current, stale, snapshot);
    assert.equal(merged[0].reactions[0].count, 5);
    assert.equal(merged[0].reactions[0].viewerReacted, true);
    // Legitimate text/edits from the snapshot still apply.
    assert.equal(merged[0].body, 'server body');
  });

  it('accepts a snapshot that began after the mutation and clears protection', () => {
    const guard = createReactionSnapshots();
    guard.noteMutation('m1');
    const snapshot = guard.beginSnapshot();
    const merged = guard.merge([row('m1', 5, 'local', true)], [row('m1', 6, 'server', true)], snapshot);
    assert.equal(merged[0].reactions[0].count, 6);
    assert.deepEqual(guard.protectedIds(), []);
  });

  it('protects older loaded messages, not just the newest page', () => {
    const guard = createReactionSnapshots();
    const snapshot = guard.beginSnapshot();
    guard.noteMutation('old-message');
    const merged = guard.merge(
      [row('old-message', 9, 'local', true)],
      [row('old-message', 2, 'older page')],
      snapshot,
    );
    assert.equal(merged[0].reactions[0].count, 9);
  });

  it('does not disturb untouched messages in the same snapshot', () => {
    const guard = createReactionSnapshots();
    const snapshot = guard.beginSnapshot();
    guard.noteMutation('m1');
    const merged = guard.merge(
      [row('m1', 5, 'local', true), row('m2', 1, 'local')],
      [row('m1', 4), row('m2', 3, 'edited')],
      snapshot,
    );
    assert.equal(merged.find((m) => m.id === 'm1')?.reactions[0].count, 5);
    assert.equal(merged.find((m) => m.id === 'm2')?.reactions[0].count, 3);
    assert.equal(merged.find((m) => m.id === 'm2')?.body, 'edited');
  });

  it('never lets an older snapshot overwrite a newer applied snapshot (CASE B)', () => {
    const guard = createReactionSnapshots();
    const older = guard.beginSnapshot();
    const newer = guard.beginSnapshot();
    guard.merge([row('m1', 5, 'local', true)], [row('m1', 7, 'newer', true)], newer);
    const afterOlder = guard.merge([row('m1', 7, 'newer', true)], [row('m1', 3, 'older')], older);
    assert.equal(afterOlder[0].reactions[0].count, 7, 'older snapshot cannot roll back a newer one');
  });

  it('does not treat a snapshot begun during a pending mutation as authoritative', () => {
    const guard = createReactionSnapshots();
    guard.beginMutation('m1');
    const during = guard.beginSnapshot();
    const merged = guard.merge([row('m1', 5, 'local', true)], [row('m1', 1, 'stale')], during);
    assert.equal(merged[0].reactions[0].count, 5);
    guard.commitMutation('m1');
    assert.deepEqual(guard.protectedIds(), []);
  });

  it('applies a snapshot that begins after the mutation settles', () => {
    const guard = createReactionSnapshots();
    guard.beginMutation('m1');
    guard.commitMutation('m1');
    const after = guard.beginSnapshot();
    const merged = guard.merge([row('m1', 5, 'local', true)], [row('m1', 6, 'server', true)], after);
    assert.equal(merged[0].reactions[0].count, 6);
  });

  it('drops protection on reset (room or account change)', () => {
    const guard = createReactionSnapshots();
    guard.noteMutation('m1');
    guard.reset();
    assert.deepEqual(guard.protectedIds(), []);
    const merged = guard.merge([row('m1', 5, 'local', true)], [row('m1', 1, 'fresh')], 0);
    assert.equal(merged[0].reactions[0].count, 1);
  });
});
