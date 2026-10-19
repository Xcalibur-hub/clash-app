/**
 * Duel Stage layout guards — pure presentation rules only.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DUEL_CROWD_MIN_HEIGHT,
  DUEL_STAGE_MIN_SHARE,
  DUEL_STAGE_SHARE,
  duelStageIsSummary,
  duelStageMode,
  duelStageShare,
  duelStageType,
} from './duelStageLayout.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('duel stage layout', () => {
  it('keeps the default Stage at or above the 55% floor', () => {
    assert.ok(DUEL_STAGE_SHARE.default >= DUEL_STAGE_MIN_SHARE);
    assert.ok(duelStageShare('default') >= DUEL_STAGE_MIN_SHARE);
    assert.ok(duelStageShare('judging') >= DUEL_STAGE_MIN_SHARE);
  });

  it('does not apply the floor to condensed or expanded Crowd', () => {
    assert.ok(duelStageShare('condensed') < DUEL_STAGE_MIN_SHARE);
    assert.ok(duelStageShare('crowdExpanded') < DUEL_STAGE_MIN_SHARE);
    assert.equal(duelStageIsSummary('condensed'), true);
    assert.equal(duelStageIsSummary('crowdExpanded'), true);
    assert.equal(duelStageIsSummary('default'), false);
  });

  it('resolves judging before keyboard and keyboard before expanded Crowd', () => {
    assert.equal(duelStageMode({ judging: true, condensed: true, crowdExpanded: true }), 'judging');
    assert.equal(duelStageMode({ judging: false, condensed: true, crowdExpanded: true }), 'condensed');
    assert.equal(duelStageMode({ judging: false, condensed: false, crowdExpanded: true }), 'crowdExpanded');
    assert.equal(duelStageMode({ judging: false, condensed: false, crowdExpanded: false }), 'default');
  });

  it('reserves a real minimum height for the Crowd', () => {
    assert.ok(DUEL_CROWD_MIN_HEIGHT >= 120);
  });

  it('tightens the ramp on an A50 at default font scale', () => {
    const a50 = duelStageType({ width: 360, fontScale: 1 });
    assert.equal(a50.compact, true);
    assert.equal(a50.positionLines, 2);
    const wide = duelStageType({ width: 412, fontScale: 1 });
    assert.equal(wide.compact, false);
    assert.ok(wide.argumentSize > a50.argumentSize);
  });

  it('tightens the ramp for narrow screens and enlarged fonts', () => {
    assert.equal(duelStageType({ width: 320, fontScale: 1 }).compact, true);
    assert.equal(duelStageType({ width: 412, fontScale: 1.3 }).compact, true);
    assert.equal(duelStageType({ width: 0, fontScale: Number.NaN }).compact, true);
  });

  it('never allows more than two position lines', () => {
    for (const width of [320, 360, 412, 800]) {
      for (const fontScale of [1, 1.3, 2]) {
        assert.ok(duelStageType({ width, fontScale }).positionLines <= 2);
      }
    }
  });

  it('keeps the Stage free of a hardcoded reaction total', () => {
    const src = fs.readFileSync(path.join(here, '../components/liveArena/ImmersiveClash.tsx'), 'utf8');
    assert.doesNotMatch(src, /count=\{2\}/);
    assert.match(src, /duelStageMode/);
  });
});
