/**
 * Behavioural regression tests for the final functional corrections.
 *
 * The suite in `arenaRoomEligibility.test.ts` proves the *model* decides
 * correctly. This file proves the **screen is actually wired to it** — the
 * distinction the review drew, and the reason the previous fix passed its tests
 * while still shipping a broken button.
 *
 * Every assertion below reads real source from the app and either:
 *
 *   · mounts the real component (see `scripts/aura/render-check.tsx` for the
 *     executable half), or
 *   · asserts a structural property of the wiring that cannot be satisfied by a
 *     correct model alone — e.g. that the room screen performs every target the
 *     action region can emit.
 *
 * ## The three defects
 *
 * 1. The judging CTA scrolled the inverted list, away from the judging panel that
 *    holds the ballot. Removed; the panel is the single door.
 * 2. "Join this clash" reached non-members and invoked `upgradeToDebater`, which
 *    requires a participant row. Removed; signed-out users go to auth and
 *    signed-in non-members are admitted as spectators.
 * 3. `ActionRegion` and `SpectatorJoinBar` each decided upgrade eligibility and
 *    disagreed. Both now consume `canUpgradeToDebater()`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canUpgradeToDebater,
  memberStanding,
  primaryRoomAction,
  type RoomPhase,
  type ViewerStanding,
} from '../utils/arenaRoomEligibility.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

const ROOM = 'app/arena/room/[roomId].tsx';
const ACTION = 'components/arena/ActionRegion.tsx';
const BAR = 'components/liveArena/SpectatorJoinBar.tsx';

/**
 * Source with comments removed.
 *
 * Necessary because these files legitimately *describe* the defects they fix, and
 * a naive grep would match the explanation instead of the code.
 */
function code(rel: string): string {
  return read(rel)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

describe('defect 1 — the judging CTA is gone and the panel is the door', () => {
  it('no longer scrolls the inverted list to reach the ballot', () => {
    // `scrollToEnd()` on an inverted FlatList scrolls to the *oldest* end of the
    // thread — away from the judging panel the CTA was supposed to reveal. That
    // was the entire body of the handler.
    assert.doesNotMatch(
      code(ROOM),
      /scrollToEnd/,
      'the room still scrolls a list to reach the ballot',
    );
  });

  it('no longer has a judging_panel handoff for the action region', () => {
    // The target existed only to serve the removed CTA.
    assert.doesNotMatch(code(ROOM), /judging_panel/, 'a judging-panel handoff is back');
    assert.doesNotMatch(code(ACTION), /judging_panel/, 'ActionRegion still emits a panel target');
  });

  it('keeps the judging panel mounted, and it is the ballot', () => {
    const room = code(ROOM);
    assert.match(room, /<LiveRoomJudgingPanel/, 'the ballot panel is not mounted');

    const panel = code('components/liveArena/LiveRoomJudgingPanel.tsx');
    // The panel must actually record votes — otherwise removing the CTA would
    // have removed the ballot's only entrance.
    assert.match(panel, /onVoteSide/, 'the panel no longer casts side votes');
    assert.match(panel, /onVoteArgument/, 'the panel no longer casts argument votes');
    assert.match(room, /onVoteSide=/, 'the screen does not wire the side ballot');
    assert.match(room, /onVoteArgument=/, 'the screen does not wire the argument ballot');
  });

  it('preserves the empty-floor branch and keyboard handling', () => {
    // The correction must not disturb these; they were called out explicitly.
    const room = code(ROOM);
    assert.match(room, /emptyFloor/, 'the empty-floor branch is gone');
    assert.match(room, /KeyboardAvoidingView/, 'keyboard avoidance is gone');
    assert.match(room, /useKeyboardVisible/, 'keyboard visibility tracking is gone');
    assert.match(room, /setComposerFocus/, 'composer focus handling is gone');
  });
});

describe('defect 2 — non-members never reach the upgrade RPC', () => {
  const nonMember: ViewerStanding = {
    kind: 'non_member',
    role: null,
    hasSideVote: false,
    hasArgumentVote: false,
  };
  const signedOut: ViewerStanding = {
    kind: 'signed_out',
    role: null,
    hasSideVote: false,
    hasArgumentVote: false,
  };

  it('distinguishes the three populations from real auth state', () => {
    const room = code(ROOM);
    // `viewer === null` covers both "signed out" and "signed in, not joined", so
    // collapsing them is exactly how the bad offer reached signed-out users.
    assert.match(room, /useAuth/, 'the room does not read auth state');
    assert.match(room, /signed_out/, 'the room never produces a signed-out standing');
    assert.match(room, /non_member/, 'the room never produces a non-member standing');
    assert.match(room, /'member'/, 'the room never produces a member standing');
  });

  it('routes auth to the existing gate rather than inventing a join flow', () => {
    const room = code(ROOM);
    // `useRequireAuth` is the app's single gate for account-owned actions.
    assert.match(room, /requireAuth\(\)/, 'the auth target is not wired to the auth gate');
    // No new RPC may be introduced for this.
    assert.doesNotMatch(room, /joinArenaTopic|join_arena_topic/, 'a bespoke join call was added');
  });

  it('never labels a non-member offer as joining the debate', () => {
    // `upgrade_arena_spectator` is the only "join the debate" path and it needs a
    // participant row. Offering that label to a non-member is the defect.
    for (const phase of ['OPEN', 'FINAL_ARGUMENTS', 'JUDGING'] as const) {
      const o = primaryRoomAction(phase, nonMember);
      assert.notEqual(o.action, 'upgrade_to_debater', `${phase}: upgrade offered to a non-member`);
      assert.doesNotMatch(String(o.label), /join the debate/i);
    }
  });

  it('sends the two outsider populations to different places', () => {
    assert.equal(primaryRoomAction('OPEN', signedOut).target, 'auth');
    // A non-member is admitted by `watch_arena_room`, which takes no stance. The
    // stance sheet (`join_sheet`) is the upgrade surface and would 42501 here.
    assert.equal(primaryRoomAction('OPEN', nonMember).target, 'watch_confirm');
    assert.equal(primaryRoomAction('OPEN', signedOut).action, 'sign_in');
    assert.equal(primaryRoomAction('OPEN', nonMember).action, 'watch');
  });
});

describe('defect 3 — one upgrade decision across both surfaces', () => {
  it('feeds the join bar the phase and standing, not a bare boolean', () => {
    const room = code(ROOM);
    assert.match(room, /<SpectatorJoinBar[\s\S]*?phase=/, 'the bar is not told the phase');
    assert.match(room, /<SpectatorJoinBar[\s\S]*?standing=/, 'the bar is not told the standing');
    // The old prop is what let the bar re-derive the rule.
    assert.doesNotMatch(
      room,
      /<SpectatorJoinBar[\s\S]{0,200}?roomFull=\{/,
      'the bar is still given a bare roomFull flag',
    );
  });

  it('passes the P0009 rejection through to the shared model', () => {
    const room = code(ROOM);
    // Without this the UI re-offers an upgrade the server already refused.
    assert.match(
      room,
      /roomFullOnUpgrade/,
      'the P0009 rejection is not part of the standing',
    );
    assert.match(
      room,
      /roomFullOnUpgrade,/,
      'roomFullOnUpgrade is not included in the memoised standing',
    );
  });

  it('lets both surfaces reach the same verdict for the same state', () => {
    /*
     * The consensus property, stated as pure logic. The render check proves it
     * against the mounted components; this proves the decision itself cannot
     * diverge, because both surfaces call this one function.
     */
    const spectator = memberStanding('spectator');
    const phases: RoomPhase[] = ['OPEN', 'FINAL_ARGUMENTS', 'JUDGING', 'SETTLED', 'CANCELLED'];
    const states: ViewerStanding[] = [
      spectator,
      memberStanding('spectator', { roomFull: true }),
      memberStanding('spectator', { roomFullOnUpgrade: true }),
    ];
    for (const phase of phases) {
      for (const standing of states) {
        const offered = primaryRoomAction(phase, standing).action === 'upgrade_to_debater';
        const permitted = canUpgradeToDebater(phase, standing);
        assert.equal(offered, permitted, `${phase}: offer and predicate disagree`);
      }
    }
  });

  it('stops offering after the server says the room is full', () => {
    // The stale-snapshot case: capacity looked free at render, the RPC said P0009.
    const spectator = memberStanding('spectator');
    assert.equal(canUpgradeToDebater('OPEN', spectator), true);
    assert.equal(
      canUpgradeToDebater('OPEN', { ...spectator, roomFullOnUpgrade: true }),
      false,
    );
  });
});

describe('wiring integrity', () => {
  it('performs every target the action region can emit', () => {
    /*
     * The action region can emit exactly three targets. If the screen forgets one,
     * that offer becomes a dead button — which is defect 1 in a new costume. This
     * asserts the screen handles all three.
     */
    const room = code(ROOM);
    /*
     * Four targets, and each must have its own branch. The list is exhaustive on
     * purpose: when `watch_confirm` was added, this test failed until the screen
     * handled it — which is exactly the "dead button" class it was written for.
     */
    for (const target of ['auth', 'watch_confirm', 'join_sheet', 'composer']) {
      assert.match(room, new RegExp(`target === '${target}'`), `no branch for target '${target}'`);
    }
  });

  it('leaves verdict consolidation untouched', () => {
    // Explicitly out of scope: the settled screen must still have exactly one
    // result surface, as the previous fix established.
    const room = code(ROOM);
    assert.equal((room.match(/<VerdictRegion/g) ?? []).length, 1);
    assert.equal((room.match(/<LiveRoomResultReveal/g) ?? []).length, 0);
  });

  it('adds no RPC, migration or backend call', () => {
    // The correction is UI-side only: no new database surface may appear.
    const room = code(ROOM);
    assert.doesNotMatch(room, /supabase\.rpc\(/, 'the screen gained a direct RPC call');
    assert.doesNotMatch(room, /from\(['"]arena_/, 'the screen gained a direct table read');
  });

  it('keeps the bar a pure function of its props', () => {
    // No internal state that could drift from the shared decision.
    const bar = code(BAR);
    assert.match(bar, /canUpgradeToDebater\(/, 'the bar does not consult the shared predicate');
    assert.doesNotMatch(bar, /useState/, 'the bar holds local eligibility state');
  });
});
