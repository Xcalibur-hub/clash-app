import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chipFill,
  crowdRowLabel,
  reactionBurstFor,
  sidePlateFill,
  hexWithAlpha,
  matchupMetrics,
  phaseAnnouncement,
  sidePlateBorder,
} from './liveArenaStyles.ts';

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

describe('chat row labels', () => {
  it('collapses whitespace and normalizes the handle', () => {
    assert.equal(crowdRowLabel('maya', 'hello   crowd'), '@maya: hello crowd');
    assert.equal(crowdRowLabel('@liam', '  spaced  '), '@liam: spaced');
    assert.equal(crowdRowLabel('maya', 'line\nbreak'), '@maya: line break');
  });

  it('bounds the announcement length so one message cannot run away', () => {
    const long = crowdRowLabel('maya', 'x'.repeat(400));
    assert.ok(long.length <= 240);
    assert.ok(long.endsWith('…'));
    assert.equal(crowdRowLabel('maya', 'y'.repeat(50), Number.NaN).length, '@maya: '.length + 50);
    assert.equal(crowdRowLabel('maya', 'z'.repeat(50), 20).length, 20);
  });
});

describe('phase announcements', () => {
  it('names the server phase, never a device clock', () => {
    assert.equal(phaseAnnouncement('OPEN'), 'Clash phase: Open floor');
    assert.equal(phaseAnnouncement('FINAL_ARGUMENTS'), 'Clash phase: Final arguments');
    assert.equal(phaseAnnouncement('JUDGING'), 'Clash phase: Judging');
    assert.equal(phaseAnnouncement('SETTLED'), 'Clash phase: Settled');
    assert.equal(phaseAnnouncement('CANCELLED'), 'Clash phase: No verdict');
  });
});
describe('role chip fill', () => {
  it('uses a soft scheme-aware fill so a role chip reads at small sizes', () => {
    const light = chipFill({ scheme: 'light' });
    const dark = chipFill({ scheme: 'dark' });
    assert.notEqual(light, dark, 'light and dark do not share a fill');
    assert.match(light, /^rgba\(/);
    assert.match(dark, /^rgba\(/);
  });
});
describe('side plates and reaction bursts', () => {
  it('tints a fighter plate from that fighter real side colour', () => {
    assert.equal(sidePlateFill('#E5484D', 'light'), 'rgba(229,72,77,0.06)');
    assert.equal(sidePlateFill('#E5484D', 'dark'), 'rgba(229,72,77,0.1)');
    assert.equal(sidePlateFill('#2F6FEB', 'light'), 'rgba(47,111,235,0.06)');
    assert.equal(sidePlateFill('nope', 'light'), 'rgba(128,128,128,0.06)');
  });

  it('bursts only on a real rise, never on paint or a decrease', () => {
    assert.equal(reactionBurstFor(null, [{ emoji: 'F', count: 2 }], 'm1'), null);
    assert.equal(reactionBurstFor([{ emoji: 'F', count: 2 }], [{ emoji: 'F', count: 2 }], 'm1'), null);
    assert.equal(reactionBurstFor([{ emoji: 'F', count: 3 }], [{ emoji: 'F', count: 1 }], 'm1'), null);
    assert.equal(reactionBurstFor([{ emoji: 'F', count: 2 }], [{ emoji: 'F', count: 3 }], 'm1')?.emoji, 'F');
    assert.equal(reactionBurstFor([], [{ emoji: 'C', count: 1 }], 'm1')?.key, 'm1:C:1');
    assert.equal(reactionBurstFor([{ emoji: 'F', count: 1 }], [{ emoji: 'F', count: 9 }, { emoji: 'C', count: 8 }], 'm1')?.emoji, 'F');
    assert.equal(reactionBurstFor([{ emoji: 'F', count: 2 }], [{ emoji: 'F', count: 3 }], null), null);
    assert.equal(reactionBurstFor([{ emoji: 'F', count: 2 }], [], 'm1'), null);
  });

  it('returns only an emoji and a replay key, never a tally', () => {
    const signal = reactionBurstFor([{ emoji: 'X', count: 4 }], [{ emoji: 'X', count: 7 }], 'm9');
    assert.deepEqual(Object.keys(signal ?? {}).sort(), ['emoji', 'key']);
  });
});