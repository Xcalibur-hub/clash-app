import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  communityActiveLabel,
  communityMemberLabel,
  communityMemberSummary,
  communityReplyCountLabel,
  sortCommunityFeedDesc,
  splitCommunityFeed,
  type CommunityFeedRow,
} from './vaultCommunityFeed.ts';

const row = (id: string, createdAt: number, type: CommunityFeedRow['type']): CommunityFeedRow => ({
  id,
  createdAt,
  type,
});

describe('community feed composition', () => {
  it('orders newest first with an id tie-break', () => {
    const ordered = sortCommunityFeedDesc([
      row('b', 100, 'discussion'),
      row('a', 100, 'discussion'),
      row('c', 200, 'discussion'),
    ]);
    assert.deepEqual(ordered.map((r) => r.id), ['c', 'b', 'a']);
  });

  it('is stable across renders for identical timestamps', () => {
    const input = [row('x', 50, 'discussion'), row('y', 50, 'discussion'), row('z', 50, 'discussion')];
    const once = sortCommunityFeedDesc(input).map((r) => r.id);
    const twice = sortCommunityFeedDesc(input).map((r) => r.id);
    assert.deepEqual(once, twice);
  });

  it('pins the most recent announcement and keeps discussions separate', () => {
    const { announcement, discussions } = splitCommunityFeed([
      row('a', 10, 'announcement'),
      row('b', 30, 'announcement'),
      row('c', 20, 'discussion'),
      row('d', 40, 'discussion'),
    ]);
    assert.equal(announcement?.id, 'b');
    assert.deepEqual(discussions.map((r) => r.id), ['d', 'c']);
  });

  it('returns no announcement when there is none', () => {
    const { announcement, discussions } = splitCommunityFeed([row('c', 20, 'discussion')]);
    assert.equal(announcement, null);
    assert.deepEqual(discussions.map((r) => r.id), ['c']);
  });
});

describe('community labels', () => {
  it('formats member and activity counts', () => {
    assert.equal(communityMemberLabel(124), '124 members');
    assert.equal(communityMemberLabel(1), '1 member');
    assert.equal(communityActiveLabel(0), '0 active today');
    assert.equal(communityMemberSummary(124, 12), '124 members · 12 active today');
  });

  it('formats reply counts', () => {
    assert.equal(communityReplyCountLabel(0), 'Reply');
    assert.equal(communityReplyCountLabel(1), '1 reply');
    assert.equal(communityReplyCountLabel(3), '3 replies');
  });
});
