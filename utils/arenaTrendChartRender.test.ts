/**
 * Render-path checks for the ranking-race SVG: demo fixture → stage → path strings.
 * Catches empty Path `d` values that would leave a blank chart on device.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRankPath,
  TREND_RACE_CHART_HEIGHT,
  TREND_RACE_PAD,
  trendRaceXFor,
} from './arenaTrendChartPath.ts';
import { arenaTrendDemoBattles } from './arenaTrendDevFixture.ts';
import { raceHasCrossings, trendRaceStage } from './arenaTrendRank.ts';

const NOW = Date.UTC(2026, 9, 5, 15, 0, 0);

describe('trending race SVG render path', () => {
  it('uses a fixed 240px chart height', () => {
    assert.equal(TREND_RACE_CHART_HEIGHT, 240);
  });

  it('feeds RACE + non-empty Path strings for the demo fixture', () => {
    const battles = arenaTrendDemoBattles(NOW);
    assert.equal(battles.length, 10);

    const stage = trendRaceStage({
      topicCount: battles.length,
      pointCounts: battles.map((b) => b.series.length),
    });
    assert.equal(stage, 'RACE');
    assert.equal(raceHasCrossings(battles.map((b) => b.series)), true);

    const byId = new Map(battles.map((b) => [b.topicId, b]));
    assert.deepEqual(byId.get('demo-ai-jobs')?.series.map((p) => p.v), [1, 1, 2, 3]);
    assert.deepEqual(byId.get('demo-iphone-pixel')?.series.map((p) => p.v), [5, 4, 2, 1]);
    assert.deepEqual(byId.get('demo-college')?.series.map((p) => p.v), [3, 2, 1, 2]);

    const width = 360;
    const times = battles.flatMap((b) => b.series.map((p) => p.t));
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const xFor = trendRaceXFor(width, minT, maxT, 4);

    for (const battle of battles) {
      const d = buildRankPath(battle.series, xFor, TREND_RACE_CHART_HEIGHT);
      assert.ok(d.length > 0, `${battle.topicId} must produce a Path`);
      assert.match(d, /^M[\d.]+ [\d.]+/);
      assert.match(d, /L[\d.]+ [\d.]+/);
      const nums = [...d.matchAll(/([\d.]+)/g)].map((m) => Number(m[1]));
      for (let i = 0; i < nums.length; i += 2) {
        assert.ok(nums[i]! >= TREND_RACE_PAD.left - 0.1 && nums[i]! <= width);
        assert.ok(nums[i + 1]! >= 0 && nums[i + 1]! <= TREND_RACE_CHART_HEIGHT);
      }
    }
  });
});
