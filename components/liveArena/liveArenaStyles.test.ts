import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hexWithAlpha, matchupMetrics, sidePlateBorder } from './liveArenaStyles.ts';

describe('live arena stage metrics', () => {
  it('keeps the full split on a roomy screen at normal font scale', () => {
    const m = matchupMetrics({ width: 411, fontScale: 1 });
    assert.equal(m.compact, false);
    assert.equal(m.avatarSize, 56);
    assert.equal(m.nameSize, 17);
    assert.equal(m.positionLines, 2);
    assert.equal(m.vsMarginTop, 44);
  });

  it('tightens on a narrow screen or an enlarged system font', () => {
    assert.equal(matchupMetrics({ width: 360, fontScale: 1 }).compact, true);
    assert.equal(matchupMetrics({ width: 411, fontScale: 1.3 }).compact, true);
    assert.equal(matchupMetrics({ width: 411, fontScale: 1.25 }).compact, true);
    assert.equal(matchupMetrics({ width: 391, fontScale: 1.24 }).compact, false);
  });

  it('never returns NaN geometry for implausible input', () => {
    const m = matchupMetrics({ width: Number.NaN, fontScale: Number.NaN });
    assert.equal(Number.isFinite(m.avatarSize), true);
    assert.equal(Number.isFinite(m.nameSize), true);
    assert.equal(Number.isFinite(m.vsMarginTop), true);
    assert.equal(m.compact, true, 'fallback width 360 is compact');
  });

  it('derives side-plate tints without inventing colours', () => {
    assert.equal(hexWithAlpha('#2F6FEB', 0.3), 'rgba(47,111,235,0.3)');
    assert.equal(hexWithAlpha('#ffffff', 1), 'rgba(255,255,255,1)');
    assert.equal(hexWithAlpha('rgb(1,2,3)', 0.2), 'rgba(128,128,128,0.2)');
    assert.equal(hexWithAlpha('#2F6FEB', 9), 'rgba(47,111,235,1)', 'alpha clamps');
    assert.equal(sidePlateBorder('#2F6FEB', 'light'), 'rgba(47,111,235,0.28)');
    assert.equal(sidePlateBorder('#E5484D', 'dark'), 'rgba(229,72,77,0.34)');
  });
});
