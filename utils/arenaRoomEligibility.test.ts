/**
 * Behavioural regression tests for the Phase 2 review — issues 1 and 3.
 *
 * ## What went wrong, and what these tests pin
 *
 * Issue 1: the room screen rendered a "Cast your verdict" region whose handler was
 * literally `if (action === 'vote') { return; }`. A primary call to action that
 * does nothing is worse than no call to action.
 *
 * Issue 3: `permittedAction()` advertised a ballot to spectators in JUDGING. The
 * server (`submit_arena_side_vote`) refuses that with `only debaters may vote`, so
 * the UI promised something that could never succeed.
 *
 * Every assertion below is derived from an RPC in `supabase/migrations/`, quoted
 * in `utils/arenaRoomEligibility.ts`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptsArguments,
  canCastVerdict,
  canUpgradeToDebater,
  primaryRoomAction,
  shouldMountJudgingPanel,
  type RoomPhase,
  type ViewerStanding,
} from '../utils/arenaRoomEligibility.ts';

const debater = (over: Partial<ViewerStanding> = {}): ViewerStanding => ({
  isMember: true,
  role: 'debater',
  hasSideVote: false,
  hasArgumentVote: false,
  ...over,
});

const spectator = (over: Partial<ViewerStanding> = {}): ViewerStanding => ({
  isMember: true,
  role: 'spectator',
  hasSideVote: false,
  hasArgumentVote: false,
  ...over,
});

const outsider: ViewerStanding = {
  isMember: false,
  role: null,
  hasSideVote: false,
  hasArgumentVote: false,
};

const PHASES: RoomPhase[] = ['OPEN', 'FINAL_ARGUMENTS', 'JUDGING', 'SETTLED', 'CANCELLED'];

describe('issue 1 — no action may be offered without a real destination', () => {
  it('never offers an enabled action with no target to perform it', () => {
    // The defect was an enabled CTA whose handler returned immediately. Any offer
    // that is actionable must name the surface that performs it.
    for (const phase of PHASES) {
      for (const standing of [debater(), spectator(), outsider]) {
        const o = primaryRoomAction(phase, standing);
        if (o.enabled) {
          assert.ok(o.target !== null, `${phase}/${standing.role}: "${o.label}" is enabled with no target`);
          assert.ok(o.label.length > 0, `${phase}: enabled action has no label`);
        }
      }
    }
  });

  it('handles the verdict CTA by opening the judging panel, not by returning', () => {
    const o = primaryRoomAction('JUDGING', debater());
    assert.equal(o.action, 'cast_verdict');
    assert.equal(o.enabled, true);
    assert.equal(o.target, 'judging_panel', 'the verdict CTA must point at the panel that records it');
  });

  it('explains itself rather than showing a dead control when no action exists', () => {
    // An unavailable state must carry a reason. A disabled button with no
    // explanation is the same dead end as a no-op handler.
    for (const phase of PHASES) {
      for (const standing of [debater(), spectator(), outsider]) {
        const o = primaryRoomAction(phase, standing);
        if (!o.enabled) {
          if (o.action === 'none') {
            assert.ok(
              o.label === '' && o.reason !== null,
              `${phase}/${standing.role}: unavailable action must be a reason, not a label`,
            );
          }
        }
      }
    }
  });

  it('mounts exactly the surface that can record a ballot', () => {
    // If the CTA says "cast your verdict", the panel must be mounted.
    for (const phase of PHASES) {
      for (const standing of [debater(), spectator(), outsider]) {
        const o = primaryRoomAction(phase, standing);
        if (o.action === 'cast_verdict') {
          assert.equal(
            shouldMountJudgingPanel(phase, standing),
            true,
            `${phase}/${standing.role}: CTA offered but no panel mounted`,
          );
        }
      }
    }
  });
});

describe('issue 3 — server-authoritative eligibility', () => {
  it('never offers a ballot to a spectator', () => {
    // `submit_arena_side_vote`: "if v_part.role <> 'debater' then raise ... 'only
    // debaters may vote'". Spectators can never vote, in any phase.
    for (const phase of PHASES) {
      for (const hasSideVote of [true, false]) {
        const o = primaryRoomAction(phase, spectator({ hasSideVote }));
        assert.notEqual(o.action, 'cast_verdict', `${phase}: spectator was offered a ballot`);
      }
    }
    assert.equal(canCastVerdict('JUDGING', spectator()), false);
  });

  it('never offers a ballot outside JUDGING', () => {
    // The RPC raises `the room is not in judging`.
    for (const phase of ['OPEN', 'FINAL_ARGUMENTS', 'SETTLED', 'CANCELLED'] as const) {
      assert.equal(canCastVerdict(phase, debater()), false, `${phase}: ballot offered out of phase`);
      assert.notEqual(primaryRoomAction(phase, debater()).action, 'cast_verdict');
    }
  });

  it('never offers a second ballot once one is recorded', () => {
    // The RPC raises `side vote already recorded` (P0006).
    assert.equal(canCastVerdict('JUDGING', debater({ hasSideVote: true })), false);
    const o = primaryRoomAction('JUDGING', debater({ hasSideVote: true }));
    assert.equal(o.enabled, false);
    assert.match(String(o.reason), /recorded/i, 'a recorded ballot must say so');
  });

  it('never offers an action to someone who is not a room member', () => {
    // Every mutation requires a participant row; `arena_is_room_member` gates posts.
    for (const phase of ['JUDGING', 'SETTLED', 'CANCELLED'] as const) {
      const o = primaryRoomAction(phase, outsider);
      assert.notEqual(o.action, 'cast_verdict', `${phase}: outsider offered a ballot`);
      assert.notEqual(o.action, 'argue', `${phase}: outsider offered the floor`);
    }
  });

  it('matches the argument-posting windows exactly', () => {
    // `post_arena_room_message`: status must be OPEN or FINAL_ARGUMENTS.
    assert.equal(acceptsArguments('OPEN'), true);
    assert.equal(acceptsArguments('FINAL_ARGUMENTS'), true);
    assert.equal(acceptsArguments('JUDGING'), false);
    assert.equal(acceptsArguments('SETTLED'), false);
    assert.equal(acceptsArguments('CANCELLED'), false);

    // And the offered action follows: only a debater inside that window is
    // invited to the composer.
    assert.equal(primaryRoomAction('OPEN', debater()).target, 'composer');
    assert.equal(primaryRoomAction('FINAL_ARGUMENTS', debater()).target, 'composer');
    assert.notEqual(primaryRoomAction('JUDGING', debater()).target, 'composer');
  });

  it('respects the upgrade window and capacity', () => {
    // `upgrade_arena_spectator`: OPEN/FINAL_ARGUMENTS/JUDGING, not full.
    assert.equal(canUpgradeToDebater('OPEN', spectator()), true);
    assert.equal(canUpgradeToDebater('FINAL_ARGUMENTS', spectator()), true);
    assert.equal(canUpgradeToDebater('JUDGING', spectator()), true);
    assert.equal(canUpgradeToDebater('SETTLED', spectator()), false);
    assert.equal(canUpgradeToDebater('CANCELLED', spectator()), false);
    // P0009 — room is full.
    assert.equal(canUpgradeToDebater('OPEN', spectator({ roomFull: true })), false);
    // A debater is never offered an upgrade.
    assert.equal(canUpgradeToDebater('OPEN', debater()), false);
  });

  it('offers a full-room spectator an explanation instead of a join control', () => {
    const o = primaryRoomAction('OPEN', spectator({ roomFull: true }));
    assert.equal(o.enabled, false);
    assert.equal(o.target, null);
    assert.match(String(o.reason), /full/i);
  });

  it('offers nothing at all in a terminal room', () => {
    for (const standing of [debater(), spectator(), outsider]) {
      for (const phase of ['SETTLED', 'CANCELLED'] as const) {
        const o = primaryRoomAction(phase, standing);
        assert.equal(o.enabled, false, `${phase}: terminal room offered an action`);
        assert.equal(o.target, null);
      }
    }
  });

  it('distinguishes a signed-out reader from a signed-in non-member only by honesty', () => {
    // Both lack a participant row, so neither may act. The offer must never
    // pretend otherwise.
    for (const phase of PHASES) {
      const o = primaryRoomAction(phase, outsider);
      if (o.enabled) {
        assert.equal(o.target, 'join_sheet', `${phase}: a non-member can only be invited to join`);
      }
    }
  });

  it('keeps one coherent story for every phase × role', () => {
    // No combination may both enable an action and announce that nothing is
    // available.
    for (const phase of PHASES) {
      for (const standing of [debater(), debater({ hasSideVote: true }), spectator(), outsider]) {
        const o = primaryRoomAction(phase, standing);
        if (o.enabled) assert.equal(o.reason === null || o.action === 'join_debate', true);
        assert.ok(['argue', 'final_argument', 'cast_verdict', 'join_debate', 'none'].includes(o.action));
      }
    }
  });
});
