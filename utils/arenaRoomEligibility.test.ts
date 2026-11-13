/**
 * Behavioural regression tests for the Arena action model.
 *
 * ## The three defects these tests pin
 *
 * **Defect 1 — the judging CTA.** A "Cast your verdict" button sat above the
 * transcript while the real ballot lived in `LiveRoomJudgingPanel` below it. The
 * only thing the button did was `scrollToEnd()` on the inverted message list,
 * which scrolls *away* from the panel. Two doors to one ballot, and the nearer
 * one was broken. The CTA is gone; the panel is the door, and this file asserts
 * the offer names it instead of pretending to be it.
 *
 * **Defect 2 — non-member join authorization.** `primaryRoomAction()` advertised
 * "Join this clash" to anyone without a participant row, and the handler called
 * `upgradeToDebater` — which `upgrade_arena_spectator` rejects with
 * `join the room first` (42501) because there is no row to upgrade. Joining a
 * room is `watch_arena_room`, a different admission, and it requires a session.
 *
 * **Defect 3 — two upgrade decisions.** `ActionRegion` and `SpectatorJoinBar`
 * each decided independently whether an upgrade was available, and disagreed:
 * the bar kept offering "pick a side" in SETTLED rooms and after a P0009 capacity
 * rejection. Both now read `canUpgradeToDebater()`.
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
  canWatchRoom,
  memberStanding,
  primaryRoomAction,
  shouldMountJudgingPanel,
  type RoomPhase,
  type ViewerStanding,
} from '../utils/arenaRoomEligibility.ts';

const debater = (over: Partial<ViewerStanding> = {}): ViewerStanding =>
  memberStanding('debater', over);

const spectator = (over: Partial<ViewerStanding> = {}): ViewerStanding =>
  memberStanding('spectator', over);

/** Signed in, holds no participant row in this room. */
const nonMember: ViewerStanding = {
  kind: 'non_member',
  role: null,
  hasSideVote: false,
  hasArgumentVote: false,
};

/** No session at all. */
const signedOut: ViewerStanding = {
  kind: 'signed_out',
  role: null,
  hasSideVote: false,
  hasArgumentVote: false,
};

const OUTSIDERS = [nonMember, signedOut];
const PHASES: RoomPhase[] = ['OPEN', 'FINAL_ARGUMENTS', 'JUDGING', 'SETTLED', 'CANCELLED'];

describe('defect 1 — the judging CTA no longer duplicates the panel', () => {
  it('never offers a separate "cast your verdict" control', () => {
    // The panel already contains the Agree / Disagree / best-argument controls.
    // A second button for the same ballot was the redundant door.
    for (const phase of PHASES) {
      for (const standing of [debater(), debater({ hasSideVote: true }), spectator(), ...OUTSIDERS]) {
        const o = primaryRoomAction(phase, standing);
        assert.notEqual(o.action, 'cast_verdict', `${phase}: a verdict CTA is back`);
      }
    }
  });

  it('tells a debater who still owes a ballot that the ballot is open', () => {
    // Removing the CTA must not remove the *information*. The debater needs to
    // know a ballot awaits them; the panel below is where it is held.
    const o = primaryRoomAction('JUDGING', debater());
    assert.equal(o.enabled, false, 'a disabled CTA must not render a button');
    assert.equal(o.target, null, 'nothing to hand off to — the panel is already mounted');
    assert.match(String(o.reason), /ballot/i, 'the debater is not told a ballot awaits them');
  });

  it('mounts the ballot panel for every member during judging', () => {
    // The panel is the only ballot surface, so it must be present whenever a
    // member could plausibly need it — including one who already voted, who is
    // shown their recorded choice rather than an empty ballot.
    for (const standing of [debater(), debater({ hasSideVote: true }), spectator()]) {
      assert.equal(shouldMountJudgingPanel('JUDGING', standing), true);
    }
    for (const standing of OUTSIDERS) {
      assert.equal(
        shouldMountJudgingPanel('JUDGING', standing),
        false,
        'non-members have no ballot to see',
      );
    }
    // ...and never outside judging.
    for (const phase of ['OPEN', 'FINAL_ARGUMENTS', 'SETTLED', 'CANCELLED'] as const) {
      assert.equal(shouldMountJudgingPanel(phase, debater()), false, `${phase}: panel mounted`);
    }
  });

  it('still reports which debaters may actually vote, for the panel to use', () => {
    // The CTA is gone but eligibility is not: the panel's controls must reflect
    // the same predicate the RPC applies.
    assert.equal(canCastVerdict('JUDGING', debater()), true);
    assert.equal(canCastVerdict('JUDGING', debater({ hasSideVote: true })), false);
    assert.equal(canCastVerdict('JUDGING', spectator()), false);
  });
});

describe('defect 2 — non-members are never routed into the upgrade RPC', () => {
  it('never offers the upgrade action to anyone without a participant row', () => {
    // `upgrade_arena_spectator`: `if not found then raise 'join the room first'
    // using errcode = '42501'`.
    for (const phase of PHASES) {
      for (const standing of OUTSIDERS) {
        const o = primaryRoomAction(phase, standing);
        assert.notEqual(
          o.action,
          'upgrade_to_debater',
          `${phase}: a non-member was offered an upgrade the server always rejects`,
        );
      }
    }
    assert.equal(canUpgradeToDebater('OPEN', nonMember), false);
    assert.equal(canUpgradeToDebater('JUDGING', nonMember), false);
  });

  it('sends a signed-out reader to authentication, not to the join sheet', () => {
    // The join sheet calls `upgradeToDebater`. A signed-out user must clear auth
    // first: `watch_arena_room` and `upgrade_arena_spectator` both raise 42501.
    const o = primaryRoomAction('OPEN', signedOut);
    assert.equal(o.action, 'sign_in');
    assert.equal(o.target, 'auth');
    assert.equal(o.enabled, true);
  });

  it('routes a signed-in non-member through spectator admission instead', () => {
    // `watch_arena_room` requires auth only, and admits them as a spectator.
    // This is a *different* action from the upgrade, with a different RPC.
    const o = primaryRoomAction('OPEN', nonMember);
    assert.equal(o.action, 'watch');
    assert.equal(o.target, 'join_sheet');
    assert.equal(o.enabled, true);
    // The label must not promise a debate seat it cannot deliver.
    assert.doesNotMatch(o.label, /join the debate/i);
    assert.match(o.label, /watch/i);
  });

  it('keeps the two outsider populations distinguishable in every phase', () => {
    // Collapsing them was the defect: `viewer === null` means "no participant
    // row", which covers both, and the old code read it as "signed out".
    for (const phase of ['OPEN', 'FINAL_ARGUMENTS', 'JUDGING'] as const) {
      assert.notEqual(
        primaryRoomAction(phase, signedOut).action,
        primaryRoomAction(phase, nonMember).action,
        `${phase}: signed-out and signed-in non-members get the same offer`,
      );
    }
  });

  it('never admits a spectator into a cancelled room', () => {
    // `watch_arena_room`: `if v_room.status = 'CANCELLED' then raise ...`.
    assert.equal(canWatchRoom('CANCELLED'), false);
    const o = primaryRoomAction('CANCELLED', nonMember);
    assert.equal(o.enabled, false);
    assert.equal(o.target, null);
  });
});

describe('defect 3 — one upgrade decision, shared by both surfaces', () => {
  it('hides the upgrade in every terminal phase', () => {
    // `upgrade_arena_spectator`: `if v_room.status not in ('OPEN',
    // 'FINAL_ARGUMENTS', 'JUDGING') then raise 'this room is no longer accepting
    // debaters'`. The join bar used to keep offering it in SETTLED.
    for (const phase of ['SETTLED', 'CANCELLED'] as const) {
      assert.equal(canUpgradeToDebater(phase, spectator()), false, `${phase}: upgrade still offered`);
      assert.notEqual(primaryRoomAction(phase, spectator()).action, 'upgrade_to_debater');
    }
  });

  it('respects real room capacity', () => {
    // `if v_room.participant_count >= v_room.capacity then raise 'room is full'
    // using errcode = 'P0009'`.
    assert.equal(canUpgradeToDebater('OPEN', spectator({ roomFull: true })), false);
    assert.equal(canUpgradeToDebater('JUDGING', spectator({ roomFull: true })), false);
    assert.equal(canUpgradeToDebater('OPEN', spectator({ roomFull: false })), true);
  });

  it('stops offering the upgrade after a P0009 rejection', () => {
    /*
     * The room snapshot can still claim a free slot after the server has already
     * refused — the room filled between render and tap. Without this the UI would
     * re-offer the same rejected action indefinitely. `roomFullOnUpgrade` is set
     * by `useLiveArenaRoom` when it catches P0009.
     */
    assert.equal(canUpgradeToDebater('OPEN', spectator({ roomFullOnUpgrade: true })), false);
    const o = primaryRoomAction('OPEN', spectator({ roomFullOnUpgrade: true }));
    assert.equal(o.enabled, false);
    assert.equal(o.target, null, 'a rejected upgrade must not hand off to the join sheet again');
  });

  it('never lets a stale snapshot override a recorded rejection', () => {
    // Both flags are considered, and either one is enough to stop the offer.
    for (const roomFull of [true, false]) {
      assert.equal(
        canUpgradeToDebater('OPEN', spectator({ roomFull, roomFullOnUpgrade: true })),
        false,
        `roomFull=${roomFull}: the P0009 flag was ignored`,
      );
    }
  });

  it('does not offer an upgrade to someone who is already a debater', () => {
    // `if v_part.role = 'debater' then ... raise 'already a debater' (P0006)`.
    assert.equal(canUpgradeToDebater('OPEN', debater()), false);
    assert.equal(canUpgradeToDebater('JUDGING', debater()), false);
  });

  it('is the single source of truth for both components', () => {
    /*
     * This is the structural half of defect 3. `ActionRegion` and
     * `SpectatorJoinBar` previously computed upgrade availability themselves, so
     * they could — and did — disagree. Both files are asserted to call the shared
     * predicate, which is what makes the tests above binding on the UI.
     */
    const action = readSource('components/arena/ActionRegion.tsx');
    const bar = readSource('components/liveArena/SpectatorJoinBar.tsx');

    assert.match(action, /primaryRoomAction/, 'ActionRegion no longer reads the shared model');
    assert.match(bar, /canUpgradeToDebater/, 'SpectatorJoinBar no longer reads the shared model');
    // Neither may re-implement the rule it is supposed to consume.
    assert.doesNotMatch(
      bar,
      /status\s*[!=]==?\s*['"](OPEN|FINAL_ARGUMENTS|JUDGING)['"]/,
      'SpectatorJoinBar re-derived the phase window instead of asking the model',
    );
  });
});

describe('preserved participant permissions', () => {
  it('still sends a debater to the composer while arguments are accepted', () => {
    // `post_arena_room_message`: status must be OPEN or FINAL_ARGUMENTS.
    assert.equal(acceptsArguments('OPEN'), true);
    assert.equal(acceptsArguments('FINAL_ARGUMENTS'), true);
    assert.equal(acceptsArguments('JUDGING'), false);

    for (const phase of ['OPEN', 'FINAL_ARGUMENTS'] as const) {
      const o = primaryRoomAction(phase, debater());
      assert.equal(o.enabled, true, `${phase}: the debater cannot reach the floor`);
      assert.equal(o.target, 'composer');
    }
    assert.equal(primaryRoomAction('FINAL_ARGUMENTS', debater()).action, 'final_argument');
  });

  it('still refuses the floor outside the argument window', () => {
    for (const phase of ['JUDGING', 'SETTLED', 'CANCELLED'] as const) {
      assert.notEqual(primaryRoomAction(phase, debater()).action, 'argue', `${phase}: floor offered`);
    }
  });

  it('never offers a spectator a ballot, in any phase', () => {
    // `submit_arena_side_vote`: `only debaters may vote`.
    for (const phase of PHASES) {
      for (const hasSideVote of [true, false]) {
        assert.notEqual(
          primaryRoomAction(phase, spectator({ hasSideVote })).action,
          'cast_verdict',
        );
      }
    }
    assert.equal(canCastVerdict('JUDGING', spectator()), false);
  });

  it('never offers a ballot outside JUDGING or twice', () => {
    for (const phase of ['OPEN', 'FINAL_ARGUMENTS', 'SETTLED', 'CANCELLED'] as const) {
      assert.equal(canCastVerdict(phase, debater()), false, `${phase}: ballot out of phase`);
    }
    assert.equal(canCastVerdict('JUDGING', debater({ hasSideVote: true })), false);
    assert.match(String(primaryRoomAction('JUDGING', debater({ hasSideVote: true })).reason), /recorded/i);
  });
});

describe('model invariants', () => {
  it('never enables an action without a target, or a label without an action', () => {
    const every: ViewerStanding[] = [
      debater(),
      debater({ hasSideVote: true }),
      spectator(),
      spectator({ roomFull: true }),
      spectator({ roomFullOnUpgrade: true }),
      nonMember,
      signedOut,
    ];
    for (const phase of PHASES) {
      for (const standing of every) {
        const o = primaryRoomAction(phase, standing);
        if (o.enabled) {
          assert.ok(o.target !== null, `${phase}: "${o.label}" enabled with nowhere to go`);
          assert.ok(o.label.length > 0, `${phase}: enabled action has no label`);
        } else {
          assert.equal(o.label, '', `${phase}: a disabled offer still renders a label`);
          assert.ok(o.reason !== null, `${phase}: a disabled offer explains nothing`);
          assert.equal(o.target, null, `${phase}: a disabled offer still names a target`);
        }
      }
    }
  });

  it('only ever returns a known action', () => {
    const known = ['argue', 'final_argument', 'upgrade_to_debater', 'sign_in', 'watch', 'none'];
    for (const phase of PHASES) {
      for (const standing of [debater(), spectator(), nonMember, signedOut]) {
        assert.ok(known.includes(primaryRoomAction(phase, standing).action));
      }
    }
  });
});

// --- helpers ----------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
function readSource(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}
