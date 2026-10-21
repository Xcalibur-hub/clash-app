/**
 * UI Phase 1 + Phase 2 — Immersive Live Duel presentation and motion regressions.
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
import { duelCrowdChrome, duelSpeakingCue, stageEntranceKey } from './duelStageMotion.ts';

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
    assert.match(rail, /duelSpeakingCue/);
    assert.match(rail, /shouldPlayOnce/);
    assert.match(rail, /useReducedMotion/);
  });

  it('keeps argument stage reduced-motion aware and long-text collapse', () => {
    const stage = read('components/liveArena/CurrentArgumentStage.tsx');
    assert.match(stage, /useReducedMotion/);
    assert.match(stage, /duelArgumentPreview/);
    assert.match(stage, /Read full argument/);
    assert.match(stage, /Awaiting the opening|Waiting for the opening/);
    assert.match(stage, /FadeInDown/);
    assert.match(stage, /numberOfLines/);
  });

  it('separates Crowd from Stage without production fixtures', () => {
    const crowd = read('components/liveArena/LiveCrowdLayer.tsx');
    const shell = read('components/liveArena/ImmersiveClash.tsx');
    assert.match(crowd, /duelCrowdChrome/);
    assert.match(crowd, /chrome\.label/);
    assert.match(crowd, /crowd\?\.messages/);
    assert.match(read('utils/duelStageMotion.ts'), /LIVE CROWD/);
    assert.match(read('utils/duelStageMotion.ts'), /'CROWD'/);
    assert.doesNotMatch(crowd, /DEV_LAYOUT_ROWS|showDevLayout|FloatingReaction/);
    assert.doesNotMatch(crowd, /withRepeat|Animated\.loop/);
    assert.match(shell, /Live conversation · separate from Stage|Spectator conversation/);
    assert.match(shell, /Focus Stage/);
    assert.match(crowd, /Spectator conversation/);
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

describe('UI Phase 2 live-event motion and terminal polish', () => {
  it('gates Stage entrance once and wires arrival without hydration replay', () => {
    const shell = read('components/liveArena/ImmersiveClash.tsx');
    assert.match(shell, /stageEntranceKey/);
    assert.match(shell, /isNewOfficialMoment/);
    assert.match(shell, /liveStage/);
    assert.match(shell, /arrivalSide/);
    assert.match(shell, /setTimeout\(\(\) => setArrivedId/);
    assert.equal(stageEntranceKey('c1', 'scope'), 'stage-entrance:c1:scope');
  });

  it('stops SPEAKING and Live chrome after the duel ends', () => {
    assert.equal(duelSpeakingCue({ live: true, terminal: 'settled', focusSide: 'A', side: 'A' }), false);
    assert.deepEqual(duelCrowdChrome(true), { label: 'CROWD', idleState: 'Closed' });
    const shell = read('components/liveArena/ImmersiveClash.tsx');
    assert.match(shell, /live=\{liveStage\}/);
    assert.match(shell, /terminal=\{terminal\}/);
    const demo = read('components/dev/arenaDemo/DemoArena.tsx');
    assert.match(demo, /terminal=\{closed \?/);
  });

  it('keeps verdict reveal one-shot with cancelled distinction', () => {
    const verdict = read('components/liveArena/VerdictReveal.tsx');
    assert.match(verdict, /shouldPlayOnce\(momentKey\)/);
    assert.match(verdict, /useReducedMotion/);
    assert.match(verdict, /CANCELLED/);
    assert.match(verdict, /VERDICT/);
  });

  it('offers accessible full argument access in compact and truncated modes', () => {
    const stage = read('components/liveArena/CurrentArgumentStage.tsx');
    assert.match(stage, /needsFullAccess/);
    assert.match(stage, /Read full argument/);
    assert.match(stage, /accessibilityHint/);
    const shell = read('components/liveArena/ImmersiveClash.tsx');
    assert.match(shell, /Official argument · Read full/);
  });
});

describe('UI Phase 3 spectator experience', () => {
  it('separates Stage, Crowd, reactions and composer hierarchy', () => {
    const shell = read('components/liveArena/ImmersiveClash.tsx');
    assert.match(shell, /SPECTATORS/);
    assert.match(shell, /Live conversation · separate from Stage/);
    assert.match(shell, /ReactionBurst/);
    assert.match(shell, /count=\{1\}/);
    const crowd = read('components/liveArena/LiveCrowdLayer.tsx');
    assert.match(crowd, /spectatorCrowdEmptyCopy/);
    assert.match(crowd, /Message the Crowd/);
    assert.match(crowd, /New messages ↓/);
  });

  it('keeps backing distinct from judging and private assists', () => {
    const backing = read('components/liveArena/ClashBackingActions.tsx');
    assert.match(backing, /spectatorSupportHint/);
    assert.match(backing, /Not an official vote/);
    assert.match(backing, /SUPPORT /);
    assert.doesNotMatch(backing, /Judge|Vote A|Vote B/);
    assert.match(read('utils/spectatorPresentation.ts'), /NOT A JUDGEMENT/);
    const assist = read('components/liveArena/PrivateAssistPanel.tsx');
    assert.match(assist, /PRIVATE ASSIST · NOT A VOTE/);
    assert.match(assist, /privateAssistPrivacyLabel/);
    assert.match(assist, /never posted in the Crowd/);
  });

  it('wires reaction picker selection and reduced-motion tray', () => {
    const picker = read('components/liveArena/ArenaReactionPicker.tsx');
    assert.match(picker, /spectatorReactionHint/);
    assert.match(picker, /useReducedMotion/);
    assert.match(picker, /accessibilityState=\{\{ selected \}\}/);
    assert.match(picker, /minHeight: 56/);
    const burst = read('components/liveArena/ReactionBurst.tsx');
    assert.match(burst, /useReducedMotion/);
    assert.match(burst, /duration: 900/);
  });

  it('preserves spectator vs fighter assist surfaces and terminal crowd', () => {
    const shell = read('components/liveArena/ImmersiveClash.tsx');
    assert.match(shell, /canBack && !judgingFocus && !condensed/);
    assert.match(shell, /readOnly=\{Boolean\(terminal\) \|\| duel\.status !== 'open'\}/);
    assert.match(shell, /terminal !== 'cancelled'/);
    const assist = read('components/liveArena/PrivateAssistPanel.tsx');
    assert.match(assist, /Your private inbox/);
    assert.match(assist, /Send a private assist/);
    assert.match(assist, /Pending · private/);
  });

  it('keeps compact keyboard crowd path and reduced-motion burst safe', () => {
    assert.equal(duelStageMode({ judging: false, condensed: true, crowdExpanded: false }), 'condensed');
    const shell = read('components/liveArena/ImmersiveClash.tsx');
    assert.match(shell, /condensed=\{keyboardOpen\}|condensed/);
    assert.match(shell, /reduced \? undefined : FadeIn/);
    const burst = read('components/liveArena/ReactionBurst.tsx');
    assert.match(burst, /if \(reduced\)/);
  });
});
