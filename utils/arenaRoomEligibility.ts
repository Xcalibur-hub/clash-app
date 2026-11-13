/**
 * Arena room participation eligibility — pure, testable, no React.
 *
 * ## Why this module exists
 *
 * Three independent reviews have now blocked on the same underlying failure: the
 * room screen decided what to advertise from layout convenience, while the
 * database decided what it would accept, and the two disagreed. Every rule below
 * is transcribed from the authoritative RPCs in `supabase/migrations/` — not
 * guessed. Where a rule lives in SQL, the constraint is quoted so a later reader
 * can check it.
 *
 * | action             | RPC                          | server rule |
 * |--------------------|------------------------------|-------------|
 * | argue              | `post_arena_room_message`    | signed in, room member, `status in ('OPEN','FINAL_ARGUMENTS')` |
 * | vote (side)        | `submit_arena_side_vote`     | signed in, participant, **`role = 'debater'`**, `status = 'JUDGING'`, no prior side vote |
 * | vote (argument)    | `submit_arena_argument_vote` | same as side vote, plus not your own argument |
 * | record stance      | `record_arena_final_stance`  | `status = 'SETTLED'`, participant row, final stance not already recorded |
 * | upgrade to debater | `upgrade_arena_spectator`    | `status in ('OPEN','FINAL_ARGUMENTS','JUDGING')`, **member with role `spectator`**, `participant_count < capacity` |
 * | watch (admission)  | `watch_arena_room`           | signed in, topic live (or settled), room not CANCELLED |
 *
 * ## The three corrections encoded here
 *
 * 1. **Spectators can never vote.** `submit_arena_side_vote` raises
 *    `only debaters may vote`. An earlier version returned `vote` for a
 *    spectator whenever the screen passed `mayJudge`.
 *
 * 2. **A non-member cannot upgrade.** `upgrade_arena_spectator` raises
 *    `join the room first` (42501) when there is no participant row. An earlier
 *    version advertised "Join this clash" to anyone without a row — including
 *    signed-out readers — and then called the upgrade. Joining a room is
 *    `watch_arena_room`, a *different* admission, and only for signed-in users.
 *    So the model now distinguishes three populations explicitly rather than
 *    collapsing them into `isMember: false`.
 *
 * 3. **One upgrade decision.** `ActionRegion` and `SpectatorJoinBar` used to
 *    compute eligibility independently, and disagreed — the bar kept offering
 *    "pick a side" in SETTLED rooms and after a P0009 capacity rejection. Both
 *    now read `canUpgradeToDebater()`.
 */

export type RoomPhase = 'OPEN' | 'FINAL_ARGUMENTS' | 'JUDGING' | 'SETTLED' | 'CANCELLED';
export type ViewerRole = 'debater' | 'spectator';

/**
 * Who is looking at the room, in the terms the server uses.
 *
 * These are three genuinely different populations and the UI must not merge them:
 *
 * - `signed_out`  — no session. Every mutation fails with 42501. The only honest
 *                   action is to authenticate.
 * - `non_member`  — has a session, no `arena_room_participants` row for this
 *                   topic. May be *admitted* as a spectator via
 *                   `watch_arena_room`; may **not** upgrade, post or vote.
 * - `member`      — holds a participant row. May post, vote (if a debater) or
 *                   upgrade (if a spectator), subject to phase and capacity.
 */
export type ViewerKind = 'signed_out' | 'non_member' | 'member';

/** Everything the UI needs to know about the viewer's standing in one room. */
export interface ViewerStanding {
  /** Which of the three populations this viewer belongs to. */
  kind: ViewerKind;
  /** Only meaningful when `kind === 'member'`. Non-members have no role. */
  role: ViewerRole | null;
  /** True when this debater has already cast a side ballot in this room. */
  hasSideVote: boolean;
  /** True when this debater has already cast a best-argument ballot. */
  hasArgumentVote: boolean;
  /**
   * `participant_count >= capacity`, the exact test `upgrade_arena_spectator`
   * applies before raising P0009. Both the capacity the room reports and the
   * server's rejection set this; see `roomFullOnUpgrade`.
   */
  roomFull?: boolean;
  /**
   * Set after the server rejected an upgrade with P0009 — the room filled up
   * between render and tap. The room snapshot may still claim a free slot, so this
   * flag is what stops the UI offering the same rejected action again.
   */
  roomFullOnUpgrade?: boolean;
}

/** Convenience constructor for the common case: a member with a role. */
export function memberStanding(
  role: ViewerRole,
  overrides: Partial<Omit<ViewerStanding, 'kind' | 'role'>> = {},
): ViewerStanding {
  return { kind: 'member', role, hasSideVote: false, hasArgumentVote: false, ...overrides };
}

export type RoomAction =
  | 'argue'
  | 'final_argument'
  | 'upgrade_to_debater'
  | 'sign_in'
  | 'watch'
  | 'none';

export type RoomActionTarget = 'composer' | 'join_sheet' | 'auth';

export interface RoomActionOffer {
  action: RoomAction;
  /** What the control says. Empty for `none`. */
  label: string;
  /**
   * Whether the control is *actionable*. An offer with `enabled: false` must
   * render as an explanation, never as a button that goes nowhere.
   */
  enabled: boolean;
  /** Why the action is unavailable, in the user's terms. Null when enabled. */
  reason: string | null;
  /** Which surface actually performs the action. `null` when there is nothing to hand off to. */
  target: RoomActionTarget | null;
}

function offer(
  partial: Omit<RoomActionOffer, 'reason' | 'target'> & {
    reason?: string | null;
    target?: RoomActionTarget | null;
  },
): RoomActionOffer {
  return {
    reason: partial.reason ?? null,
    target: partial.target ?? null,
    action: partial.action,
    label: partial.label,
    enabled: partial.enabled,
  };
}

/** A terminal phase admits no new participants and no new arguments. */
export function isTerminalPhase(phase: RoomPhase): boolean {
  return phase === 'SETTLED' || phase === 'CANCELLED';
}

/** Arguments can be posted only in these phases (`post_arena_room_message`). */
export function acceptsArguments(phase: RoomPhase): boolean {
  return phase === 'OPEN' || phase === 'FINAL_ARGUMENTS';
}

/**
 * A debater may cast a side ballot only here.
 *
 * `submit_arena_side_vote` raises `the room is not in judging` outside JUDGING and
 * `only debaters may vote` for spectators, so all of these conditions are required.
 */
export function canCastVerdict(phase: RoomPhase, standing: ViewerStanding): boolean {
  return (
    phase === 'JUDGING' &&
    standing.kind === 'member' &&
    standing.role === 'debater' &&
    !standing.hasSideVote
  );
}

/**
 * Whether `upgrade_arena_spectator` would accept this caller right now.
 *
 * This is **the single decision** shared by `ActionRegion` and `SpectatorJoinBar`.
 * It requires all four of the server's conditions:
 *
 *   · a participant row (`join the room first`, 42501)
 *   · role `spectator` (`only spectators can upgrade`)
 *   · a non-terminal phase (`this room is no longer accepting debaters`)
 *   · `participant_count < capacity` (`room is full`, P0009)
 *
 * The last one is read from either the room snapshot or the P0009 rejection flag,
 * because after a rejection the snapshot is known to be stale and trusting it
 * would offer the same failing action forever.
 */
export function canUpgradeToDebater(phase: RoomPhase, standing: ViewerStanding): boolean {
  if (standing.kind !== 'member') return false; // no participant row → 42501
  if (standing.role !== 'spectator') return false; // already a debater → P0006
  if (isTerminalPhase(phase)) return false; // no longer accepting debaters → P0003
  if (standing.roomFull === true) return false; // participant_count >= capacity → P0009
  if (standing.roomFullOnUpgrade === true) return false; // same, known stale snapshot
  return true;
}

/**
 * Whether a signed-in non-member may be admitted as a spectator.
 *
 * `watch_arena_room` requires auth (`sign in to watch a room`), a live or settled
 * topic, and refuses CANCELLED rooms. Admission never consumes capacity —
 * spectators do not count toward `participant_count` — so capacity is irrelevant
 * here, which is exactly why this is a different action from the upgrade.
 */
export function canWatchRoom(phase: RoomPhase): boolean {
  return phase !== 'CANCELLED';
}

/**
 * The single action the screen should offer, or `none`.
 *
 * Precedence is `argue/final_argument` → `cast_verdict` → `upgrade_to_debater` →
 * `sign_in` → `watch`. The action that moves the clash forward outranks an
 * invitation to change your own standing, which outranks admission, which
 * outranks a passive explanation.
 */
export function primaryRoomAction(phase: RoomPhase, standing: ViewerStanding): RoomActionOffer {
  // ---- Terminal phases -----------------------------------------------------
  if (phase === 'SETTLED') {
    return offer({
      action: 'none',
      label: '',
      enabled: false,
      reason: 'This clash is decided. The result and what comes next are below.',
    });
  }
  if (phase === 'CANCELLED') {
    return offer({
      action: 'none',
      label: '',
      enabled: false,
      reason: 'This room closed without a verdict.',
    });
  }

  // ---- Signed out ----------------------------------------------------------
  // Every mutation fails with 42501. Routing to auth is the only honest offer, and
  // it is *not* the join sheet: `upgrade_arena_spectator` and `watch_arena_room`
  // both require a session first.
  if (standing.kind === 'signed_out') {
    return offer({
      action: 'sign_in',
      label: 'Sign in to take part',
      enabled: true,
      target: 'auth',
    });
  }

  // ---- Signed in, no participant row ---------------------------------------
  // This population may be *admitted* as a spectator, never upgraded. Collapsing
  // this case into the member path was review defect 2: the button said "Join this
  // clash" and called an RPC that always raised `join the room first`.
  if (standing.kind === 'non_member') {
    if (!canWatchRoom(phase)) {
      return offer({
        action: 'none',
        label: '',
        enabled: false,
        reason: 'This room is not accepting new spectators.',
      });
    }
    return offer({
      action: 'watch',
      label: 'Watch this room',
      enabled: true,
      reason: 'Joining as a spectator lets you read the arguments. Fighters pick a side.',
      target: 'join_sheet',
    });
  }

  // ---- Members -------------------------------------------------------------
  if (phase === 'JUDGING') {
    if (standing.role === 'debater') {
      if (standing.hasSideVote) {
        return offer({
          action: 'none',
          label: '',
          enabled: false,
          reason: 'Your verdict is recorded. Results open when the room settles.',
        });
      }
      /*
       * Deliberately `none`, not a `cast_verdict` button.
       *
       * A debater who still owes a ballot sees `LiveRoomJudgingPanel` — the panel
       * *is* the ballot, mounted permanently in the room and containing the working
       * Agree / Disagree / best-argument controls. The previous version repeated
       * those controls behind a "Cast your verdict" CTA whose handler only called
       * `scrollToEnd()` on the inverted message list, which scrolls away from the
       * panel rather than to it. Two doors to one ballot, and the nearer one was
       * broken. The panel is the door; this region just says so.
       */
      return offer({
        action: 'none',
        label: '',
        enabled: false,
        reason: 'Your ballot is open below. Results unlock when the room settles.',
      });
    }
    // Spectators never vote — `submit_arena_side_vote` refuses them outright.
    if (canUpgradeToDebater(phase, standing)) {
      return offer({
        action: 'upgrade_to_debater',
        label: 'Join the debate',
        enabled: true,
        reason: 'Fighters are still judging. You can take a side and vote with them.',
        target: 'join_sheet',
      });
    }
    return offer({
      action: 'none',
      label: '',
      enabled: false,
      reason: 'Fighters judge this room. You can follow the verdict as it lands.',
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
        action: 'upgrade_to_debater',
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
    });
  }

  // ---- OPEN ----------------------------------------------------------------
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
      action: 'upgrade_to_debater',
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
  });
}

/**
 * Whether the judging *panel* should be mounted for this viewer.
 *
 * The panel performs the real ballot, so it must appear exactly when voting is
 * possible — or when the viewer needs to be told why it is not.
 */
export function shouldMountJudgingPanel(phase: RoomPhase, standing: ViewerStanding): boolean {
  return phase === 'JUDGING' && standing.kind === 'member';
}
