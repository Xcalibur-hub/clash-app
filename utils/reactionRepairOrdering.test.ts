/** Reaction recovery ordering: a repair must outrank an older transcript snapshot. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createReactionSnapshots } from './reactionSnapshots.ts';
import { createRoomReactionBridge } from './roomReactionBridge.ts';
import type { ArenaReaction } from '../services/liveArenaService.ts';
import type { ArenaMessage } from '../services/liveArenaService.ts';

type Row = { id: string; createdAt: number; body: string; reactions: ArenaReaction[] };

const row = (count: number, body = 'server body'): Row => ({
  id: 'm1',
  createdAt: 1,
  body,
  reactions: [{ emoji: '🔥', count, viewerReacted: true }],
});

describe('reaction repair vs transcript snapshots', () => {
  it('keeps an authoritative repair when an older snapshot resolves afterwards', async () => {
    const snapshots = createReactionSnapshots();
    const writes: ArenaReaction[][] = [];
    const repaired: ArenaReaction[] = [{ emoji: '🔥', count: 8, viewerReacted: true }];
    let reads = 0;
    const bridge = createRoomReactionBridge({
      snapshots,
      read: async () => { reads += 1; return repaired; },
      toggle: async () => { throw new Error('timeout'); },
      write: (_id, rows) => { if (rows) writes.push(rows.map((r) => ({ ...r }))); },
      onError: () => {},
    });

    // Pre-fix behaviour (queue constructed without onCommitted) produced 2 here.
    const snapshot = snapshots.beginSnapshot();
    snapshots.beginMutation('m1');
    await bridge.enqueue('m1', '🔥', () => true);
    await bridge.reconcile();
    assert.ok(reads >= 2, 'repair reads ran');
    assert.equal(bridge.pendingRepairs(), 0, 'two authoritative reads settle the target');

    const merged = snapshots.merge([row(8, 'local')], [row(2, 'server body')], snapshot);
    assert.equal(merged[0].reactions.find((r) => r.emoji === '🔥')?.count, 8, 'repair must survive');
    assert.equal(merged[0].body, 'server body', 'legitimate body updates still merge');
  });

  it('still adopts a snapshot that begins after the repair', () => {
    const snapshots = createReactionSnapshots();
    snapshots.beginMutation('m1');
    snapshots.commitMutation('m1');
    const after = snapshots.beginSnapshot();
    const merged = snapshots.merge([row(8)], [row(9, 'fresh', )], after);
    assert.equal(merged[0].reactions[0].count, 9, 'newer authority is not frozen out');
  });
});

