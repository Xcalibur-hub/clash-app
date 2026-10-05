import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  arenaAttentionScore,
  arenaTrendChangePercent,
  arenaTrendMomentum,
  rankTrendTopics,
} from './arenaTrendScore.ts';

describe('arenaAttentionScore', () => {
  it('weights unique actors, not raw volume', () => {
    assert.equal(
      arenaAttentionScore({
        messageAuthors: 2,
        reactionActors: 4,
        evidenceAuthors: 1,
        joinActors: 3,
      }),
      2 * 10 + 4 * 3 + 1 * 6 + 3 * 5,
    );
  });

  it('caps contribution so one signal class cannot dominate forever', () => {
    const capped = arenaAttentionScore({
      messageAuthors: 999,
      reactionActors: 999,
      evidenceAuthors: 999,
      joinActors: 999,
    });
    assert.equal(capped, 40 * 10 + 80 * 3 + 20 * 6 + 40 * 5);
  });

  it('never goes negative', () => {
    assert.equal(
      arenaAttentionScore({
        messageAuthors: -3,
        reactionActors: 0,
        evidenceAuthors: 0,
        joinActors: 0,
      }),
      0,
    );
  });
});

describe('arenaTrendMomentum', () => {
  it('stays steady below the sample floor', () => {
    assert.equal(arenaTrendMomentum(100, 1, 2), 'STEADY');
  });

  it('marks rising when recent outpaces prior by 25%+', () => {
    assert.equal(arenaTrendMomentum(40, 20, 5), 'RISING');
  });

  it('marks cooling when prior outpaces recent by 25%+', () => {
    assert.equal(arenaTrendMomentum(10, 40, 5), 'COOLING');
  });

  it('hides noisy percent changes', () => {
    assert.equal(arenaTrendChangePercent(12, 4, 4), null);
    assert.equal(arenaTrendChangePercent(40, 20, 6), 100);
  });
});

describe('rankTrendTopics', () => {
  it('returns at most 10 and breaks ties stably', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      topicId: `t${String(i).padStart(2, '0')}`,
      attentionScore: i < 2 ? 50 : 10,
      uniqueActors: i,
    }));
    const ranked = rankTrendTopics(rows, 10);
    assert.equal(ranked.length, 10);
    assert.equal(ranked[0].topicId, 't01');
    assert.equal(ranked[1].topicId, 't00');
  });

  it('drops zero-score rows', () => {
    assert.deepEqual(
      rankTrendTopics([{ topicId: 'a', attentionScore: 0, uniqueActors: 9 }], 10),
      [],
    );
  });
});
