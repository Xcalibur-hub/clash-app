/**
 * UI Phase 3.6 — Spectator action accessibility on compact Android heights.
 * Layout/behavioral invariants (not string-only source greps).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DUEL_CROWD_COLLAPSED_HEADER_HEIGHT,
  DUEL_CROWD_MIN_HEIGHT,
  duelCrowdHeaderOnly,
  duelSpectatorActionsFitAboveCrowd,
  duelStageIsSummary,
  duelStageMode,
  layoutRectsOverlap,
} from './duelStageLayout.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string): string =>
  fs.readFileSync(path.join(here, '..', relative), 'utf8');

/** A50 logical canvas under Demo chrome (approx. from Phase 3.5 dumps). */
const A50 = {
  viewportHeight: 2340,
  /** Demo header + event chrome + status above Stage/Crowd split. */
  chromeHeight: 420,
  /** SUPPORT row + reaction/assist footer pinned under Stage scroll. */
  stageActionsHeight: 200,
};

describe('UI Phase 3.6 spectator action accessibility', () => {
  it('uses header-only Crowd when collapsed (not keyboard, not expanded)', () => {
    assert.equal(
      duelCrowdHeaderOnly({ judging: false, condensed: false, crowdExpanded: false }),
      true,
    );
    assert.equal(
      duelCrowdHeaderOnly({ judging: true, condensed: false, crowdExpanded: false }),
      true,
    );
    assert.equal(
      duelCrowdHeaderOnly({ judging: false, condensed: true, crowdExpanded: false }),
      false,
    );
    assert.equal(
      duelCrowdHeaderOnly({ judging: false, condensed: false, crowdExpanded: true }),
      false,
    );
    assert.equal(
      duelCrowdHeaderOnly({ judging: true, condensed: false, crowdExpanded: true }),
      false,
    );
    assert.ok(DUEL_CROWD_COLLAPSED_HEADER_HEIGHT < DUEL_CROWD_MIN_HEIGHT);
    assert.ok(DUEL_CROWD_COLLAPSED_HEADER_HEIGHT >= 44);
  });

  it('fits pinned spectator actions above collapsed Crowd on A50 height', () => {
    assert.equal(
      duelSpectatorActionsFitAboveCrowd({
        viewportHeight: A50.viewportHeight,
        chromeHeight: A50.chromeHeight,
        stageActionsHeight: A50.stageActionsHeight,
        crowdHeaderHeight: DUEL_CROWD_COLLAPSED_HEADER_HEIGHT,
      }),
      true,
    );
    // Old min Crowd floor (~134) plus a tall Stage chrome budget must still leave room;
    // a pathological chrome that eats the canvas must fail the fit check.
    assert.equal(
      duelSpectatorActionsFitAboveCrowd({
        viewportHeight: A50.viewportHeight,
        chromeHeight: 2200,
        stageActionsHeight: A50.stageActionsHeight,
      }),
      false,
    );
  });

  it('keeps Expand and SUPPORT hit regions from overlapping geometrically', () => {
    // Representative post-fix geometry: Stage actions end above Crowd toggle.
    const support = { x: 42, y: 1480, width: 482, height: 44 };
    const expand = {
      x: 0,
      y: support.y + support.height + 8,
      width: 1080,
      height: DUEL_CROWD_COLLAPSED_HEADER_HEIGHT,
    };
    assert.equal(layoutRectsOverlap(support, expand), false);

    // Pre-fix failure shape from Phase 3.5: Expand strip covered Support centers.
    const expandOverlapping = { x: 0, y: 1476, width: 1080, height: 170 };
    const supportUnderExpand = { x: 42, y: 1520, width: 482, height: 44 };
    assert.equal(layoutRectsOverlap(supportUnderExpand, expandOverlapping), true);
  });

  it('keeps judging and SUPPORT modes distinct in layout rules', () => {
    assert.equal(duelStageMode({ judging: true, condensed: false, crowdExpanded: true }), 'judging');
    assert.equal(duelStageIsSummary('judging'), false);
    assert.equal(
      duelCrowdHeaderOnly({ judging: true, condensed: false, crowdExpanded: false }),
      true,
    );
    const shell = read('components/liveArena/ImmersiveClash.tsx');
    assert.match(shell, /showBackingActions = canBack && !judgingFocus && !condensed/);
    assert.match(shell, /Official judging actions/);
    const backing = read('components/liveArena/ClashBackingActions.tsx');
    assert.match(backing, /Not an official vote/);
    assert.doesNotMatch(backing, /Demo vote|Judge/);
    const demo = read('components/dev/arenaDemo/DemoArena.tsx');
    assert.match(demo, /judgingFocus=\{s\.phase === 'JUDGING'\}/);
    assert.match(demo, /Demo vote/);
  });

  it('preserves expanded Crowd and keyboard condensed summary paths', () => {
    assert.equal(duelStageMode({ judging: false, condensed: false, crowdExpanded: true }), 'crowdExpanded');
    assert.equal(duelStageMode({ judging: false, condensed: true, crowdExpanded: true }), 'condensed');
    assert.equal(duelStageIsSummary('crowdExpanded'), true);
    assert.equal(duelStageIsSummary('condensed'), true);
    assert.equal(
      duelCrowdHeaderOnly({ judging: false, condensed: false, crowdExpanded: true }),
      false,
    );
    assert.equal(
      duelCrowdHeaderOnly({ judging: false, condensed: true, crowdExpanded: false }),
      false,
    );
    const shell = read('components/liveArena/ImmersiveClash.tsx');
    assert.match(shell, /crowdHeaderOnly/);
    assert.match(shell, /!crowdHeaderOnly \? \(/);
    assert.match(shell, /LiveCrowdLayer/);
    assert.match(shell, /DUEL_COMPACT_STAGE_HEIGHT/);
  });

  it('pins Stage spectator actions outside the scroll and isolates Expand', () => {
    const shell = read('components/liveArena/ImmersiveClash.tsx');
    assert.match(shell, /stageActions/);
    assert.match(shell, /showPinnedSpectatorActions/);
    assert.match(shell, /crowdToggleCollapsed/);
    assert.match(shell, /DUEL_CROWD_COLLAPSED_HEADER_HEIGHT/);
    assert.match(shell, /Live · tap Expand to read|History · tap Expand/);
    // Expand Pressable must not declare expanding hitSlop.
    assert.doesNotMatch(shell, /hitSlop=\{?\{[^}]*bottom:\s*[1-9]/);
    assert.match(shell, /pointerEvents="none"/);
  });

  it('keeps terminal Crowd affordances for settled vs cancelled', () => {
    const shell = read('components/liveArena/ImmersiveClash.tsx');
    assert.match(shell, /terminal !== 'cancelled'/);
    assert.match(shell, /terminal === 'settled'/);
    assert.match(shell, /terminal === 'cancelled'/);
    assert.match(shell, /Conversation history|History · tap Expand/);
    assert.match(shell, /readOnly=\{Boolean\(terminal\) \|\| duel\.status !== 'open'\}/);
  });
});
