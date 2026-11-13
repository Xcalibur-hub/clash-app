/**
 * Arena room participation eligibility — pure, testable, no React.
 *
 * ## Why this module exists
 *
 * Phase 2 shipped a "Cast your verdict" call to action wired to a handler that
 * did nothing, and an `ActionRegion` that offered spectators actions the server
 * refuses. Both are the same underlying failure: the screen was deciding what to
 * advertise from layout convenience rather than from what the database would
 * actually accept.
 *
 * Every rule below is transcribed from the authoritative RPCs in
 * `supabase/migrations/` — not guessed. Where a rule lives in SQL, the exact
 * constraint is quoted so a later reader can check it.
 *
 * | action           | RPC                          | server rule |
 * |------------------|------------------------------|-------------|
 * | argue            | `post_arena_room_message`    | signed in, room member, `status in ('OPEN','FINAL_ARGUMENTS')` |
 * | vote (side)      | `submit_arena_side_vote`     | signed in, participant, **`role = 'debater'`**, `status = 'JUDGING'`, no prior side vote |
 * | vote (argument)  | `submit_arena_argument_vote` | same as side vote, plus not your own argument |
 * | record stance    | `record_arena_final_stance`  | `status = 'SETTLED'`, participant row, final stance not already recorded |
 * | upgrade to debater | `upgrade_arena_spectator`  | `status in ('OPEN','FINAL_ARGUMENTS','JUDGING')`, not full, currently spectator |
 *
 * The important correction: **spectators can never vote.** The previous model
 * returned `vote` for a spectator in JUDGING whenever `mayJudge` was true, and the
 * screen passed `mayJudge` as "is a debater who has not voted". A spectator who
 * was merely present could still be advertised a ballot the server would reject
 * with `only debaters may vote`.
 */

export type RoomPhase = 'OPEN' | 'FINAL_ARGUMENTS' | 'JUDGING' | 'SETTLED' | 'CANCELLED';
export type ViewerRole = 'debater' | 'spectator';

/** Everything the UI needs to know about the viewer's standing in one room. */
export interface ViewerStanding {
  /**
   * Signed in *and* holding a participant row in this room.
   *
   * The service returns `viewer: null` for a non-member (including a signed-out
   * reader), and `viewer.isMember: true` otherwise, so this is exactly
   * `arena_is_room_member()` on the server.
   */
  isMember: boolean;
  /** Only meaningful when `isMember`. Non-members have no role. */
  role: ViewerRole | null;
  /** Room in JUDGING and this debater has already cast a side ballot. */
  hasSideVote: boolean;
  /** Room in JUDGING and this debater has already cast a best-argument ballot. */
  hasArgumentVote: boolean;
  /** `upgrade_arena_spectator` would be refused because the room is at capacity. */
  roomFull?: boolean;
}

export type RoomAction =
  | 'argue'
  | 'final_argument'
  | 'cast_verdict'
  | 'join_debate'
  | 'open_judging'
  | 'none';

export interface RoomActionOffer {
  action: RoomAction;
  /** What the control says. Empty for `none`. */
  label: string;
  /**
   * Whether the control is *actionable*. An offer with `enabled: false` must
   * render as an explanation, never as a button that goes nowhere — that was
   * blocker 1.
   */
  enabled: boolean;
  /** Why the action is unavailable, in the user's terms. Null when enabled. */
  reason: string | null;
  /**
   * Which surface actually performs the action. `null` when there is nothing to
   * hand off to.
   */
  target: 'composer' | 'join_sheet' | 'judging_panel' | null;
}

const NONE: RoomActionOffer = { action: 'none', label: '', enabled: false, reason: null, target: null };

function offer(partial: Omit<RoomActionOffer, 'reason'> & { reason?: string | null }): RoomActionOffer {
  return { reason: null, ...partial };
}

/** Arguments can be posted only in these phases (`post_arena_room_message`). */
export function acceptsArguments(phase: RoomPhase): boolean {
  return phase === 'OPEN' || phase === 'FINAL_ARGUMENTS';
}

/**
 * A debater may cast a side ballot only here.
 *
 * `submit_arena_side_vote` raises `the room is not in judging` outside JUDGING and
 * `only debaters may vote` for spectators, so both conditions are required.
 */
export function canCastVerdict(phase: RoomPhase, standing: ViewerStanding): boolean {
  return (
    phase === 'JUDGING' &&
    standing.isMember &&
    standing.role === 'debater' &&
    !standing.hasSideVote
  );
}

/**
 * A spectator may become a debater while the room still admits new ones.
 *
 * `upgrade_arena_spectator`: `status in ('OPEN','FINAL_ARGUMENTS','JUDGING')`,
 * `participant_count < capacity`, caller's role is `spectator`.
 */
export function canUpgradeToDebater(phase: RoomPhase, standing: ViewerStanding): boolean {
  return (
    standing.isMember &&
    standing.role === 'spectator' &&
    !standing.roomFull &&
    (phase === 'OPEN' || phase === 'FINAL_ARGUMENTS' || phase === 'JUDGING')
  );
}

/**
 * The single action the screen should offer, or `none`.
 *
 * Precedence is deliberate: the action that actually moves the clash forward is
 * offered before an invitation to change your own standing. A spectator in
 * JUDGING is not shown "join the debate" ahead of the fact that judging is
 * underway; a debater who already voted is not shown a ballot again.
 */
export function primaryRoomAction(phase: RoomPhase, standing: ViewerStanding): RoomActionOffer {
  // Terminal states offer nothing. A settled room's next step lives in the result
  // region (share / next clash) rather than here, and a cancelled room has no next
  // step at all — so each says so instead of leaving a silent gap where the action
  // used to be.
  if (phase === 'SETTLED') {
    return offer({
      action: 'none',
      label: '',
      enabled: false,
      reason: 'This clash is decided. The result and what comes next are below.',
      target: null,
    });
  }
  if (phase === 'CANCELLED') {
    return offer({
      action: 'none',
      label: '',
      enabled: false,
      reason: 'This room closed without a verdict.',
      target: null,
    });
  }

  // Signed out or not a member: the honest offer is to join the room.
  // `post_arena_room_message` and both vote RPCs all require a participant row.
  if (!standing.isMember) {
    if (phase === 'OPEN' || phase === 'FINAL_ARGUMENTS') {
      return offer({
        action: 'join_debate',
        label: 'Join this clash',
        enabled: true,
        target: 'join_sheet',
      });
    }
    return offer({
      action: 'none',
      label: '',
      enabled: false,
      reason: 'Judging is closed to new participants. You can still follow the verdict.',
      target: null,
    });
  }

  if (phase === 'JUDGING') {
    if (standing.role === 'debater') {
      if (standing.hasSideVote) {
        return offer({
          action: 'none',
          label: '',
          enabled: false,
          reason: 'Your verdict is recorded. Results open when the room settles.',
          target: null,
        });
      }
      return offer({
        action: 'cast_verdict',
        label: 'Cast your verdict',
        enabled: true,
        target: 'judging_panel',
      });
    }
    // Spectators never vote — `submit_arena_side_vote` refuses them outright.
    // Advertising a ballot here was the Phase 2 defect.
    return offer({
      action: 'none',
      label: '',
      enabled: false,
      reason: 'Fighters judge this room. You can follow the verdict as it lands.',
      target: null,
    });
  }

  if (phase === 'FINAL_ARGUMENTS') {
    if (standing.role === 'debater') {
      // The last word is still a post, so it hands off to the composer like any
      // other argument — with the closing framing made explicit.
      return offer({
        action: 'final_argument',
        label: 'Make your final argument',
        enabled: true,
        target: 'composer',
      });
    }
    if (canUpgradeToDebater(phase, standing)) {
      return offer({
        action: 'join_debate',
        label: 'Join the debate',
        enabled: true,
        reason: 'Closing arguments are underway.',
        target: 'join_sheet',
      });
    }
    return offer({
      action: 'none',
      label: '',
      enabled: false,
      reason: 'Only fighters argue in the closing round. You can still react.',
      target: null,
    });
  }

  // OPEN
  if (standing.role === 'debater') {
    return offer({
      action: 'argue',
      label: 'Make your argument',
      enabled: true,
      target: 'composer',
    });
  }
  if (canUpgradeToDebater(phase, standing)) {
    return offer({
      action: 'join_debate',
      label: 'Pick a side',
      enabled: true,
      target: 'join_sheet',
    });
  }
  return offer({
    action: 'none',
    label: '',
    enabled: false,
    reason: 'This room is full. You can still follow the clash.',
    target: null,
  });
}

/**
 * Whether the judging *panel* should be mounted for this viewer.
 *
 * The panel performs the real ballot, so it must appear exactly when voting is
 * possible — the same predicate the action offer uses, which is why it lives here
 * rather than being re-derived in JSX. Phase 2 had the screen mount the panel on
 * `isDebater` alone, so a debater who had already voted still saw an empty ballot.
 */
export function shouldMountJudgingPanel(phase: RoomPhase, standing: ViewerStanding): boolean {
  return canCastVerdict(phase, standing) || (phase === 'JUDGING' && standing.isMember);
}
