/**
 * Arena room admission — which call becomes a participant, decided in one place.
 *
 * ## The blocker this closes
 *
 * The report was precise: a signed-in non-member is offered "Join this clash", the
 * shared join sheet routes every tap to `upgradeToDebater`, and
 * `upgrade_arena_spectator` refuses it with `join the room first` (42501) because
 * there is no participant row to upgrade.
 *
 * The underlying design error is small and easy to repeat: **Watch and Upgrade are
 * not the same operation and cannot share a handler.**
 *
 * | | Watch | Upgrade |
 * |---|---|---|
 * | RPC | `watch_arena_room(p_room_id)` | `upgrade_arena_spectator(p_room_id, p_stance)` |
 * | Requires | a session | a session **and** an existing spectator row |
 * | Stance | **none** — spectators store null by design | **required**, fresh and private |
 * | Capacity | never consumes a slot | consumes exactly one (P0009) |
 * | Effect | INSERT (or move) a spectator row | UPDATE the existing row's role |
 *
 * Because Watch takes no stance, it cannot reuse the stance sheet — asking a
 * non-member to pick a side would be soliciting input the RPC will not read, and
 * storing it would breach the privacy rule that spectators carry no stance. Watch
 * is therefore a single confirm action; Upgrade remains the stance sheet.
 *
 * ## What this module is
 *
 * A pure classifier plus the call to make. It names the operation, not the
 * component, so the screen and the tests agree on what "join" means for each of
 * the three populations.
 */

import {
  canUpgradeToDebater,
  canWatchRoom,
  type RoomPhase,
  type ViewerStanding,
} from './arenaRoomEligibility.ts';

/**
 * The operation that turns this viewer into a participant.
 *
 * `none` is a real answer: the viewer is already a participant, the room is
 * closed, or the server said no.
 */
export type AdmissionOperation =
  | 'authenticate' // signed out — nothing else is possible
  | 'watch' // signed in, non-member — watch_arena_room, no stance
  | 'upgrade' // existing spectator — upgrade_arena_spectator, stance required
  | 'none';

/** Why an admission is not available, in the user's terms. */
export type AdmissionBlock =
  | null
  | 'settled' // result region owns the screen
  | 'cancelled' // room closed
  | 'full' // participant_count >= capacity, or the server said P0009
  | 'not_open' // the phase admits no new participants
  | 'already_member'; // already a debater or spectator with nothing to do

export interface AdmissionDecision {
  operation: AdmissionOperation;
  /** True only when `operation` names a call the server would accept. */
  enabled: boolean;
  /** Which surface performs it. `null` for `none`. */
  target: 'auth' | 'watch_confirm' | 'stance_sheet' | null;
  /** Present when `enabled` is false. */
  reason: string | null;
  /** Why it is blocked, for accurate copy. Null when enabled. */
  block: AdmissionBlock;
}

function decide(
  operation: AdmissionOperation,
  target: AdmissionDecision['target'],
  block: AdmissionBlock = null,
  reason: string | null = null,
): AdmissionDecision {
  return { operation, enabled: operation !== 'none', target, reason, block };
}

function blocked(reason: string, block: Exclude<AdmissionBlock, null>): AdmissionDecision {
  return { operation: 'none', enabled: false, target: null, reason, block };
}

/** Phases that admit a new participant of any kind. */
function phaseAdmitsParticipants(phase: RoomPhase): boolean {
  return phase === 'OPEN' || phase === 'FINAL_ARGUMENTS' || phase === 'JUDGING';
}

/**
 * Why the caller is asking.
 *
 * The SQL contract does not distinguish these — `watch_arena_room` permits a
 * settled room — but the *product* does:
 *
 *   · `live`    — a room in play. Admission gains both reading and a path to
 *                 taking part.
 *   · `history` — a canonical duel opened after settlement. Admission is the only
 *                 way to read the transcript, and it grants reading only.
 *
 * A settled GROUP room is neither: it already shows its verdict to everybody, so
 * admission there is noise rather than access. Defaulting to `live` keeps that
 * behaviour unchanged, and only a caller that says `history` unlocks the settled
 * case.
 */
export interface AdmissionIntent {
  /**
   * True when the room is being opened as settled history (a canonical duel),
   * rather than as a live room whose result happens to be available.
   */
  historyView?: boolean;
}

/**
 * The admission that this viewer can actually perform right now.
 *
 * The five cases from the report, in the order they are checked:
 *
 *   1. signed out                 → authenticate
 *   2. signed in, non-member      → watch  (never upgrade)
 *   3. existing spectator         → upgrade, only when the server permits
 *   4. existing debater           → none, already admitted
 *   5. full / terminal / rejected → none, with the specific reason
 */
export function admissionFor(
  phase: RoomPhase,
  standing: ViewerStanding,
  intent: AdmissionIntent = {},
): AdmissionDecision {
  const historyView = intent.historyView === true;

  // ---- 5a. Terminal phases -------------------------------------------------
  /*
   * CANCELLED is refused by the server outright, so no intent can change it:
   *   `if v_room.status = 'CANCELLED' then raise 'this room is not available'`.
   */
  if (phase === 'CANCELLED') {
    return blocked('This room closed without a verdict.', 'cancelled');
  }

  /*
   * SETTLED depends on intent, and the ordering here is the whole fix.
   *
   * The previous version refused SETTLED for *everyone*, before it ever looked at
   * who was asking. But `watch_arena_room` says:
   *
   *   -- Closed topics may still be watched if the room settled (public result).
   *
   * A canonical settled duel renders "Watch Clash" (`duelPresentation().canWatch`
   * is true when `duel.status === 'settled'`), and tapping it hit this guard and
   * returned before the RPC was ever called — so a capability the server grants
   * was hidden from the only people who could use it.
   *
   * The guard was not wrong in spirit; it was a *group-room* rule applied to
   * both experiences. Both now diverge on the caller's stated intent.
   */
  if (phase === 'SETTLED' && !historyView) {
    return blocked('This clash is decided. The result and what comes next are below.', 'settled');
  }

  // ---- 1. Signed out -------------------------------------------------------
  // `watch_arena_room` raises `sign in to watch a room` (42501) without a
  // session, and the join sheet cannot help either. Auth is the only door.
  if (standing.kind === 'signed_out') {
    return decide('authenticate', 'auth');
  }

  // ---- 2. Signed in, no participant row ------------------------------------
  // `watch_arena_room` requires only a session, a live/settled topic and a
  // non-CANCELLED room. It takes NO stance and consumes NO capacity, which is
  // exactly why it is a different target from the upgrade.
  if (standing.kind === 'non_member') {
    /*
     * `canWatchRoom` is the SQL predicate — every phase except CANCELLED, which
     * was already handled above. Using it here rather than the argument window is
     * what makes settled history reachable: `phaseAdmitsParticipants` answers a
     * different question ("can someone join the debate"), and admission is not
     * that.
     */
    if (!canWatchRoom(phase)) {
      return blocked('This room is not open to new spectators right now.', 'not_open');
    }
    return decide('watch', 'watch_confirm');
  }

  // ---- 4. Already a debater ------------------------------------------------
  // Nothing to admit. Anything they may do is expressed by the action region
  // (argue / final argument), not by an admission call.
  if (standing.role === 'debater') {
    return blocked('You are already arguing in this room.', 'already_member');
  }

  // ---- 3. Existing spectator -----------------------------------------------
  /*
   * `upgrade_arena_spectator`. The *decision* is not re-derived here — it is
   * `canUpgradeToDebater()`, the same predicate `ActionRegion` and
   * `SpectatorJoinBar` render from. This function only translates the answer into
   * a reason and a target.
   *
   * Re-deriving it is precisely the defect an earlier review blocked on ("unify
   * spectator upgrade eligibility"), so the conditions are deliberately not
   * repeated below.
   */
  if (canUpgradeToDebater(phase, standing)) {
    return decide('upgrade', 'stance_sheet');
  }

  // Not upgradable. Name the actual obstacle, in the order the server checks it.
  // `roomFullOnUpgrade` first: the server has already answered P0009 and the room
  // snapshot may still look free, so trusting the snapshot would re-offer an
  // action already refused.
  if (standing.roomFullOnUpgrade === true) {
    return blocked('This room filled up while you were watching.', 'full');
  }
  if (standing.roomFull === true) {
    return blocked('This room is full. You can still follow the clash.', 'full');
  }
  return blocked('This room is no longer accepting new voices.', 'not_open');
}

/**
 * Whether the join sheet may be opened at all, and in which mode.
 *
 * A sheet that can only fail is worse than no sheet: it invites the tap, then
 * reports an error the UI already knew about. The screen gates the mount on this.
 */
export function joinSheetMode(decision: AdmissionDecision): 'watch' | 'stance' | 'closed' {
  if (!decision.enabled) return 'closed';
  if (decision.operation === 'upgrade') return 'stance';
  if (decision.operation === 'watch') return 'watch';
  // `authenticate` never opens a sheet — it routes to /auth.
  return 'closed';
}

/**
 * The copy for a failed admission attempt, keyed by what went wrong.
 *
 * Kept here rather than inline in the screen so the retry state is testable: a
 * failure must leave the viewer able to try again, with a reason that names the
 * real obstacle.
 */
export function admissionFailureNotice(kind: 'full' | 'auth' | 'generic'): string {
  switch (kind) {
    case 'full':
      return 'This room filled up while you were watching.';
    case 'auth':
      return 'Sign in to take part in this clash.';
    case 'generic':
      return 'That action could not be completed. Please try again.';
  }
}
