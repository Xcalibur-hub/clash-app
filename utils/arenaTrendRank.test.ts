import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  arenaTrendRecencyWeight,
  buildHistoricalRankSeries,
  formatRankDelta,
  rankDeltaKind,
  rankDeltaPlaces,
  rankTopicsAtBucket,
  recencyWeightedScore,
} from './arenaTrendRank.ts';

describe('arenaTrendRecencyWeight', () => {
  it('matches the documented bands', () => {
    assert.equal(arenaTrendRecencyWeight(10), 1);
    assert.equal(arenaTrendRecencyWeight(45), 0.65);
    assert.equal(arenaTrendRecencyWeight(120), 0.3);
    assert.equal(arenaTrendRecencyWeight(240), 0.1);
    assert.equal(arenaTrendRecencyWeight(400), 0);
  });
});

describe('recencyWeightedScore', () => {
  it('prefers recent activity over older equal activity', () => {
    const recent = recencyWeightedScore([{ attentionScore: 20, ageMinutes: 10 }]);
    const old = recencyWeightedScore([{ attentionScore: 20, ageMinutes: 200 }]);
    assert.ok(recent > old);
  });

  it('keeps a popular battle alive across a quiet latest bucket', () => {
    const score = recencyWeightedScore([
      { attentionScore: 2, ageMinutes: 5 },
      { attentionScore: 40, ageMinutes: 40 },
      { attentionScore: 30, ageMinutes: 90 },
    ]);
    assert.ok(score > 2);
  });
});

describe('historical ranking race', () => {
  const snaps = [
    { topicId: 'ai', bucketAt: 100, attentionScore: 50, uniqueActors: 5 },
    { topicId: 'pixel', bucketAt: 100, attentionScore: 20, uniqueActors: 3 },
    { topicId: 'college', bucketAt: 100, attentionScore: 30, uniqueActors: 4 },
    { topicId: 'ai', bucketAt: 200, attentionScore: 25, uniqueActors: 4 },
    { topicId: 'pixel', bucketAt: 200, attentionScore: 40, uniqueActors: 6 },
    { topicId: 'college', bucketAt: 200, attentionScore: 35, uniqueActors: 5 },
    { topicId: 'ai', bucketAt: 300, attentionScore: 15, uniqueActors: 3 },
    { topicId: 'pixel', bucketAt: 300, attentionScore: 55, uniqueActors: 7 },
    { topicId: 'college', bucketAt: 300, attentionScore: 40, uniqueActors: 5 },
  ];

  it('ranks a single bucket deterministically', () => {
    const ranks = rankTopicsAtBucket([
      { topicId: 'b', attentionScore: 10, uniqueActors: 1 },
      { topicId: 'a', attentionScore: 10, uniqueActors: 1 },
      { topicId: 'c', attentionScore: 20, uniqueActors: 2 },
    ]);
    assert.equal(ranks.get('c'), 1);
    assert.equal(ranks.get('a'), 2); // tie-break by topicId
    assert.equal(ranks.get('b'), 3);
  });

  it('builds overtaking rank paths from real snapshots', () => {
    const series = buildHistoricalRankSeries(snaps, ['ai', 'pixel', 'college']);
    assert.deepEqual(series.get('ai'), [
      { t: 100, v: 1 },
      { t: 200, v: 3 },
      { t: 300, v: 3 },
    ]);
    assert.deepEqual(series.get('pixel'), [
      { t: 100, v: 3 },
      { t: 200, v: 1 },
      { t: 300, v: 1 },
    ]);
    assert.deepEqual(series.get('college'), [
      { t: 100, v: 2 },
      { t: 200, v: 2 },
      { t: 300, v: 2 },
    ]);
  });

  it('omits points when a topic had no activity in a bucket', () => {
    const series = buildHistoricalRankSeries(
      [
        { topicId: 'ai', bucketAt: 1, attentionScore: 10, uniqueActors: 2 },
        { topicId: 'pixel', bucketAt: 2, attentionScore: 10, uniqueActors: 2 },
      ],
      ['ai', 'pixel'],
    );
    assert.deepEqual(series.get('ai'), [{ t: 1, v: 1 }]);
    assert.deepEqual(series.get('pixel'), [{ t: 2, v: 1 }]);
  });
});

describe('rank movement', () => {
  it('reports places gained when a topic rises', () => {
    assert.equal(rankDeltaPlaces(1, 4), 3);
    assert.equal(rankDeltaKind(1, 4, 3), 'UP');
    assert.equal(formatRankDelta('UP', 3), '↑3');
  });

  it('reports places lost when a topic falls', () => {
    assert.equal(rankDeltaPlaces(5, 2), -3);
    assert.equal(rankDeltaKind(5, 2, 3), 'DOWN');
    assert.equal(formatRankDelta('DOWN', -3), '↓3');
  });

  it('marks NEW when history exists but no hour-ago rank', () => {
    assert.equal(rankDeltaKind(2, null, 2), 'NEW');
    assert.equal(formatRankDelta('NEW', null), 'NEW');
  });

  it('marks insufficient when there is no comparison data', () => {
    assert.equal(rankDeltaKind(1, null, 0), 'INSUFFICIENT');
    assert.equal(formatRankDelta('INSUFFICIENT', null), '—');
  });
});
