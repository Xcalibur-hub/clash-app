/**
 * UI Phase 1 — Immersive Live Duel presentation regressions.
 * Source/contract guards only; no device rendering.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DUEL_COMPACT_STAGE_HEIGHT,
  DUEL_CROWD_MIN_HEIGHT,
  duelStageMode,
  duelStageType,
} from './duelStageLayout.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string): string =>
  fs.readFileSync(path.join(here, '..', relative), 'utf8');

describe('UI Phase 1 immersive duel presentation', () => {
  it('preserves ImmersiveClash prop contracts and crowd minimum', () => {
    const src = read('components/liveArena/ImmersiveClash.tsx');
    for (const key of [
      'backingSide',
      'canBack',
      'condensed',
      'judgingFocus',
      'terminal',
      'onToggleFollow',
      'fighterComposer',
      'stageFooter',
      'crowdPaddingBottom',
      'reactionBurst',
    ]) {
      assert.match(src, new RegExp(key));
    }
    assert.match(src, /minHeight: 134/);
    assert.match(src, /FadeIn\.duration\(140\)/);
    assert.match(src, /reduced \? undefined : FadeIn/);
    assert.match(src, /Read full current official argument/);
    assert.doesNotMatch(src, /count=\{2\}/);
  });

  it('renders two fighters with VS, handles, and optional backing cue', () => {
    const rail = read('components/liveArena/ClashFighterRail.tsx');
    assert.match(rail, /backingSide/);
    assert.match(rail, /VS/);
    assert.match(rail, /@\{fighter\.handle\}/);
    assert.match(rail, /YOUR SIDE/);
    assert.match(rail, /SPEAKING/);
    assert.match(rail, /duelActiveSpeakers/);
  });

  it('keeps argument stage reduced-motion aware and long-text collapse', () => {
    const stage = read('components/liveArena/CurrentArgumentStage.tsx');
    assert.match(stage, /useReducedMotion/);
    assert.match(stage, /duelArgumentPreview/);
    assert.match(stage, /Read full argument/);
    assert.match(stage, /Awaiting the opening|Waiting for the opening/);
  });

  it('separates Crowd from Stage without production fixtures', () => {
    const crowd = read('components/liveArena/LiveCrowdLayer.tsx');
    const shell = read('components/liveArena/ImmersiveClash.tsx');
    assert.match(crowd, /LIVE CROWD/);
    assert.match(crowd, /crowd\?\.messages/);
    assert.doesNotMatch(crowd, /DEV_LAYOUT_ROWS|showDevLayout|FloatingReaction/);
    assert.doesNotMatch(crowd, /withRepeat|Animated\.loop/);
    assert.match(shell, /Spectator conversation/);
    assert.match(shell, /Focus Stage/);
  });

  it('supports condensed/keyboard and A50-class type ramp', () => {
    assert.equal(duelStageMode({ judging: false, condensed: true, crowdExpanded: true }), 'condensed');
    assert.ok(DUEL_COMPACT_STAGE_HEIGHT >= 110);
    assert.ok(DUEL_CROWD_MIN_HEIGHT >= 120);
    const a50 = duelStageType({ width: 360, fontScale: 1 });
    assert.equal(a50.compact, true);
    assert.ok(a50.argumentSize <= 18);
  });

  it('keeps terminal and spectator control surfaces wired', () => {
    const src = read('components/liveArena/ImmersiveClash.tsx');
    assert.match(src, /terminal === 'settled'/);
    assert.match(src, /terminal === 'cancelled'/);
    assert.match(src, /canBack && !judgingFocus && !condensed/);
    assert.match(src, /ClashBackingActions/);
  });
});
