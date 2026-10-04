import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EXPLORE_MODES } from './exploreForYouRank.ts';
import {
  DEFAULT_FOR_YOU_FILTER,
  exploreModeAccessibilityLabel,
  FOR_YOU_FILTERS,
  forYouFilterAccessibilityLabel,
  isDuplicateForYouFilterLabel,
  packExploreMosaicRows,
} from './exploreNav.ts';

describe('Explore primary modes', () => {
  it('keeps the five Explore modes in order', () => {
    assert.deepEqual(
      EXPLORE_MODES.map((m) => m.id),
      ['for_you', 'world', 'live', 'play', 'meet'],
    );
  });

  it('exposes selected-state accessibility labels', () => {
    assert.equal(exploreModeAccessibilityLabel('For You', true), 'For You, selected');
    assert.equal(exploreModeAccessibilityLabel('World', false), 'World');
  });
});

describe('For You secondary filters', () => {
  it('defaults to ALL and never labels a filter For You', () => {
    assert.equal(DEFAULT_FOR_YOU_FILTER, 'all');
    assert.deepEqual(
      FOR_YOU_FILTERS.map((f) => f.id),
      ['all', 'trending', 'arena', 'vault', 'video', 'challenges'],
    );
    assert.deepEqual(
      FOR_YOU_FILTERS.map((f) => f.label),
      ['ALL', 'TRENDING', 'ARENA', 'VAULT', 'VIDEO', 'CHALLENGES'],
    );
    for (const filter of FOR_YOU_FILTERS) {
      assert.equal(isDuplicateForYouFilterLabel(filter.label), false);
    }
  });

  it('builds filter accessibility labels', () => {
    assert.equal(forYouFilterAccessibilityLabel('ALL', true), 'Filter ALL, selected');
    assert.equal(forYouFilterAccessibilityLabel('TRENDING', false), 'Filter TRENDING');
  });
});

describe('packExploreMosaicRows', () => {
  it('uses feature then pair rhythm', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      id: String(i),
      kind: 'TAKE',
    }));
    const rows = packExploreMosaicRows(items);
    assert.equal(rows[0]?.type, 'feature');
    assert.equal(rows[1]?.type, 'pair');
    assert.equal(rows[2]?.type, 'pair');
    assert.equal(rows.length, 3);
  });

  it('ends with a single when one item remains', () => {
    const rows = packExploreMosaicRows([
      { id: 'a', kind: 'TAKE' },
      { id: 'b', kind: 'TAKE' },
      { id: 'c', kind: 'TAKE' },
      { id: 'd', kind: 'TAKE' },
    ]);
    assert.equal(rows[0]?.type, 'feature');
    assert.equal(rows[1]?.type, 'single');
  });
});
