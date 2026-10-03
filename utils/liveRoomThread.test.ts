import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mergeMessagesById,
  rankReplies,
  replyPreview,
  selectThreadRoots,
} from './liveRoomThread.ts';

function msg(
  id: string,
  opts: {
    parent?: string | null;
    createdAt?: number;
    reactions?: number;
    replyCount?: number;
    pending?: boolean;
  } = {},
) {
  return {
    id,
    parentMessageId: opts.parent ?? null,
    kind: 'text',
    createdAt: opts.createdAt ?? 1,
    reactions: [{ count: opts.reactions ?? 0 }],
    replyCount: opts.replyCount,
    pending: opts.pending,
  };
}

describe('concurrent replies to the same parent', () => {
  it('keeps both children of X as independent replies', () => {
    const a = msg('A', { createdAt: 100 });
    const b = msg('B', { parent: 'A', createdAt: 101, reactions: 1 });
    const c = msg('C', { parent: 'A', createdAt: 102, reactions: 5 });
    const roots = selectThreadRoots([c, b, a]);
    assert.equal(roots.length, 1);
    assert.equal(roots[0]?.id, 'A');
    const preview = replyPreview([c, b, a], 'A', 3, false);
    assert.equal(preview.total, 2);
    assert.deepEqual(
      preview.shown.map((m) => m.id),
      ['C', 'B'],
    );
  });
});

describe('reply fan-out', () => {
  it('hides excess replies behind a real count', () => {
    const root = msg('R', { createdAt: 50, replyCount: 5 });
    const kids = [1, 2, 3, 4, 5].map((i) =>
      msg(`r${i}`, { parent: 'R', createdAt: 50 + i, reactions: 6 - i }),
    );
    const preview = replyPreview([root, ...kids], 'R', 3, false);
    assert.equal(preview.shown.length, 3);
    assert.equal(preview.hiddenCount, 2);
    assert.equal(preview.total, 5);
  });
});

describe('mergeMessagesById', () => {
  it('dedupes and prefers server over pending', () => {
    const pending = msg('m1', { createdAt: 10, pending: true });
    const server = msg('m1', { createdAt: 11 });
    const merged = mergeMessagesById([pending], [server]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.pending, undefined);
    assert.equal(merged[0]?.createdAt, 11);
  });

  it('orders by server createdAt then id', () => {
    const merged = mergeMessagesById(
      [],
      [msg('b', { createdAt: 2 }), msg('a', { createdAt: 2 }), msg('c', { createdAt: 3 })],
    );
    assert.deepEqual(
      merged.map((m) => m.id),
      ['c', 'b', 'a'],
    );
  });
});

describe('rankReplies', () => {
  it('ranks by reaction signal then recency', () => {
    const ranked = rankReplies([
      msg('low', { createdAt: 9, reactions: 1 }),
      msg('high', { createdAt: 1, reactions: 9 }),
    ]);
    assert.equal(ranked[0]?.id, 'high');
  });
});

describe('deleted parent', () => {
  it('keeps orphan replies as top-level rows', () => {
    const orphan = msg('orphan', { parent: 'gone', createdAt: 5 });
    const roots = selectThreadRoots([orphan]);
    assert.equal(roots[0]?.id, 'orphan');
  });
});
