import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dedupeExploreItems,
  diversifyByCreator,
  EXPLORE_MODES,
  EXPLORE_SEARCH_GROUPS,
} from './exploreForYouRank.ts';

describe('For You ranking helpers', () => {
  it('dedupes by kind+id', () => {
    const out = dedupeExploreItems([
      { id: '1', kind: 'TAKE' },
      { id: '1', kind: 'TAKE' },
      { id: '2', kind: 'TAKE' },
    ]);
    assert.equal(out.length, 2);
  });

  it('avoids consecutive same creator when alternatives exist', () => {
    const out = diversifyByCreator([
      { id: 'a', kind: 'TAKE', creatorId: 'u1', score: 10 },
      { id: 'b', kind: 'TAKE', creatorId: 'u1', score: 9 },
      { id: 'c', kind: 'TAKE', creatorId: 'u2', score: 8 },
    ]);
    assert.equal(out[0]?.id, 'a');
    assert.equal(out[1]?.id, 'c');
    assert.ok(out.some((x) => x.id === 'b'));
  });

  it('exposes Explore modes and search groups', () => {
    assert.deepEqual(
      EXPLORE_MODES.map((m) => m.id),
      ['for_you', 'world', 'live', 'play', 'meet'],
    );
    assert.ok(EXPLORE_SEARCH_GROUPS.some((g) => g.id === 'media'));
  });
});
