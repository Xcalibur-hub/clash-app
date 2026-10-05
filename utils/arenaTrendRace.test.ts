import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildHistoricalRankSeries,
  isEarlyHistory,
  raceHasCrossings,
  trendRaceCaption,
  trendRaceStage,
  type RankPoint,
} from './arenaTrendRank.ts';
import {
  ARENA_TREND_DEMO_ENABLED,
  ARENA_TREND_DEMO_LABEL,
  arenaTrendDemoBattles,
  arenaTrendDemoEnabled,
} from './arenaTrendDevFixture.ts';

const NOW = Date.UTC(2026, 9, 5, 15, 0, 0);

describe('race stage from real history', () => {
  it('is EMPTY when there are no ranked topics', () => {
    assert.equal(trendRaceStage({ topicCount: 0, pointCounts: [] }), 'EMPTY');
    assert.equal(trendRaceCaption('EMPTY'), null);
  });

  it('is LIVE_MARKERS when topics exist but no snapshot has landed', () => {
    const stage = trendRaceStage({ topicCount: 3, pointCounts: [0, 0, 0] });
    assert.equal(stage, 'LIVE_MARKERS');
    assert.equal(isEarlyHistory(stage), true);
    assert.deepEqual(trendRaceCaption(stage), {
      kicker: 'LIVE RANKING',
      note: 'Building today’s trend history…',
    });
  });

  it('is FIRST_POINT with a single snapshot and still draws no line', () => {
    const stage = trendRaceStage({ topicCount: 2, pointCounts: [1, 1] });
    assert.equal(stage, 'FIRST_POINT');
    assert.equal(isEarlyHistory(stage), true);
    assert.equal(trendRaceCaption(stage)?.kicker, 'LIVE RANKING');
  });

  it('is FIRST_LINES at two snapshots — the first real segments', () => {
    const stage = trendRaceStage({ topicCount: 2, pointCounts: [2, 1] });
    assert.equal(stage, 'FIRST_LINES');
    assert.equal(isEarlyHistory(stage), false);
    assert.equal(trendRaceCaption(stage), null);
  });

  it('is RACE with three or more snapshots', () => {
    assert.equal(trendRaceStage({ topicCount: 4, pointCounts: [4, 3, 2, 1] }), 'RACE');
    assert.equal(trendRaceStage({ topicCount: 1, pointCounts: [9] }), 'RACE');
  });

  it('never claims a line for a series that has only one point', () => {
    const onePoint = buildHistoricalRankSeries(
      [{ topicId: 'a', bucketAt: NOW, attentionScore: 10, uniqueActors: 2 }],
      ['a'],
    );
    assert.equal(onePoint.get('a')?.length, 1);
  });
});

describe('crossings', () => {
  const noOvertake: RankPoint[][] = [
    [
      { t: 1, v: 1 },
      { t: 2, v: 1 },
      { t: 3, v: 1 },
    ],
    [
      { t: 1, v: 2 },
      { t: 2, v: 2 },
      { t: 3, v: 2 },
    ],
  ];

  it('reports no crossing when nobody overtakes anybody', () => {
    assert.equal(raceHasCrossings(noOvertake), false);
  });

  it('reports a crossing when ranks swap', () => {
    assert.equal(
      raceHasCrossings([
        [
          { t: 1, v: 1 },
          { t: 2, v: 2 },
        ],
        [
          { t: 1, v: 2 },
          { t: 2, v: 1 },
        ],
      ]),
      true,
    );
  });

  it('needs at least two points to judge', () => {
    assert.equal(raceHasCrossings([[{ t: 1, v: 1 }], [{ t: 1, v: 2 }]]), false);
    assert.equal(raceHasCrossings([]), false);
  });
});

describe('development fixture', () => {
  it('is off by default', () => {
    assert.equal(ARENA_TREND_DEMO_ENABLED, false);
  });

  it('can never activate without __DEV__', () => {
    assert.equal(
      arenaTrendDemoEnabled({ dev: false, variant: 'development', toggle: true, envFlag: '1' }),
      false,
    );
  });

  it('can never activate in preview or production variants', () => {
    assert.equal(
      arenaTrendDemoEnabled({ dev: true, variant: 'production', toggle: true, envFlag: '1' }),
      false,
    );
    assert.equal(
      arenaTrendDemoEnabled({ dev: true, variant: 'preview', toggle: true, envFlag: '1' }),
      false,
    );
  });

  it('activates only in a development session with the toggle or env flag', () => {
    assert.equal(
      arenaTrendDemoEnabled({ dev: true, variant: 'development', toggle: true, envFlag: null }),
      true,
    );
    assert.equal(
      arenaTrendDemoEnabled({ dev: true, variant: 'development', toggle: false, envFlag: '1' }),
      true,
    );
    assert.equal(
      arenaTrendDemoEnabled({ dev: true, variant: 'development', toggle: false, envFlag: null }),
      false,
    );
  });

  it('is labelled as demo data', () => {
    assert.equal(ARENA_TREND_DEMO_LABEL, 'DEMO DATA');
  });

  it('is deterministic for a given clock', () => {
    assert.deepEqual(arenaTrendDemoBattles(NOW), arenaTrendDemoBattles(NOW));
  });

  it('shows the completed race immediately (four buckets)', () => {
    const battles = arenaTrendDemoBattles(NOW);
    assert.ok(battles.length > 0);
    for (const battle of battles) {
      assert.equal(battle.series.length, 4);
      assert.equal(battle.historyReady, true);
    }
    assert.equal(
      trendRaceStage({
        topicCount: battles.length,
        pointCounts: battles.map((b) => b.series.length),
      }),
      'RACE',
    );
  });

  it('carries the three required overtakes', () => {
    const byId = new Map(arenaTrendDemoBattles(NOW).map((b) => [b.topicId, b]));
    assert.deepEqual(byId.get('demo-ai-jobs')?.series.map((p) => p.v), [1, 1, 2, 3]);
    assert.deepEqual(byId.get('demo-iphone-pixel')?.series.map((p) => p.v), [5, 4, 2, 1]);
    assert.deepEqual(byId.get('demo-college')?.series.map((p) => p.v), [3, 2, 1, 2]);
    assert.equal(raceHasCrossings(arenaTrendDemoBattles(NOW).map((b) => b.series)), true);
  });

  it('fills a believable Top 10 with unique ranks', () => {
    const battles = arenaTrendDemoBattles(NOW);
    assert.equal(battles.length, 10);
    assert.deepEqual(
      battles.map((b) => b.rank),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
    assert.equal(new Set(battles.map((b) => b.topicId)).size, 10);
  });

  it('keeps each series in ascending time order, newest bucket at the clock', () => {
    for (const battle of arenaTrendDemoBattles(NOW)) {
      const times = battle.series.map((p) => p.t);
      assert.deepEqual(times, [...times].sort((a, b) => a - b));
      assert.equal(times[times.length - 1], NOW);
    }
  });
});

