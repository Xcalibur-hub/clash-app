/**
 * Canonical Arena hierarchy — pure, testable, no React.
 *
 * ## The problem this solves
 *
 * Arena screens had grown by accretion: the room screen is ~1,100 lines and its
 * vertical order is whatever plumbing happened to land first. A spectator opening
 * a room sees a header, a pulse strip, a cast strip, a phase rail, a message list
 * and a composer, all at roughly the same visual weight. Nothing answers the four
 * questions a participant actually has:
 *
 *   1. What phase is this, and what does that mean for me?
 *   2. What is the important content right now?
 *   3. What am I allowed to do?
 *   4. What is the community doing, and what was the result?
 *
 * ## The model
 *
 * Every room screen is an ordered set of **regions**, and the order is a function
 * of `(phase, role)` — not of layout taste. That makes the hierarchy testable,
 * and it makes "fighter and spectator see different things" a property of data
 * rather than of scattered `if (isDebater)` checks in JSX.
 *
 * The five regions are deliberately the same five on every screen, in the
 * documented order, so a user learns Arena's grammar once:
 *
 *   phase   → where we are in the clash            (status, urgency)
 *   subject → what this clash is about             (proposition, sides)
 *   action  → what the viewer may do right now     (primary affordance)
 *   floor   → official arguments / crowd activity  (live content)
 *   result  → what happened                        (verdict, rewards, replay)
 *
 * Regions that do not apply are *absent*, not empty: a spectator in the OPEN
 * phase has no `action` region, so the screen does not reserve a hole where a
 * composer would be.
 */

export type HierarchyRegion = 'phase' | 'subject' | 'action' | 'floor' | 'result';

/** The canonical reading order. Index = visual priority. */
export const REGION_ORDER: readonly HierarchyRegion[] = [
  'phase',
  'subject',
  'action',
  'floor',
  'result',
];

/*
 * Phase and role are re-exported from `arenaRoomEligibility` rather than declared
 * again. Two identical unions in two files is how the label and the button drift
 * apart; there is one definition of each.
 */
export type { RoomPhase, ViewerRole } from './arenaRoomEligibility.ts';
import type { RoomPhase, ViewerRole, ViewerStanding } from './arenaRoomEligibility.ts';
import { primaryRoomAction } from './arenaRoomEligibility.ts';

/**
 * What the viewer can do in this phase.
 *
 * `none` is a real answer, not a missing one: a spectator during JUDGING can vote
 * but cannot argue, and a spectator in SETTLED can only watch or start the next
 * clash.
 */
export type PermittedAction =
  | 'argue'
  | 'final_argument'
  | 'vote'
  | 'join_side'
  | 'watch'
  | 'start_next'
  | 'none';

export interface RegionPlan {
  region: HierarchyRegion;
  /** Stable key for React lists and for tests. */
  key: string;
  /**
   * Which *lens* this region is rendered through.
   *
   * This is what makes the two experiences genuinely distinct rather than merely
   * differently labelled. A fighter reads the official argument transcript; a
   * spectator reads the crowd's reaction to it. Both are the `floor` region, so
   * the screen's grammar is identical, but nothing about the content is shared.
   */
  lens: 'official' | 'crowd' | 'verdict';
  /** For a `floor` region: what the viewer is actually shown. */
  floor?: 'transcript' | 'crowd';
  /**
   * Relative visual weight, 0–3.
   *   3 = the one thing this screen is for right now
   *   2 = important supporting content
   *   1 = ambient / secondary
   *   0 = present but deliberately quiet
   */
  emphasis: 0 | 1 | 2 | 3;
}

export interface ArenaHierarchyInput {
  phase: RoomPhase;
  role: ViewerRole;
  /**
   * True when the viewer may cast a ballot in this room right now.
   *
   * Retained for the plan/label API, but it is **not trusted on its own**:
   * `permittedAction` derives a ballot from server-authoritative standing, so a
   * caller that flips this flag cannot cause a spectator to be offered a vote.
   */
  mayJudge?: boolean;
  /** True when a next clash is actually available to start. */
  hasNextClash?: boolean;
  /** Defaults to `true`; a signed-out reader gets no action region. */
  signedIn?: boolean;
  /**
   * Whether the viewer holds a participant row.
   *
   * Defaults to `true`, because every existing caller passes a concrete role and
   * a role only exists on a participant row. A non-member must say so explicitly
   * with `isMember: false` — the model will not infer membership from absence.
   */
  isMember?: boolean;
  /** True when the server says this participant already recorded a side vote. */
  hasSideVote?: boolean;
  /**
   * True when `participant_count >= capacity`, using `upgrade_arena_spectator`'s
   * own test. Passed through so the UI hides the upgrade the RPC would reject.
   */
  roomFull?: boolean;
  /** True after the server rejected an upgrade with P0009. */
  roomFullOnUpgrade?: boolean;
}

/**
 * Translate the plan input into the shared eligibility vocabulary.
 *
 * This is the only place the mapping lives. Both `permittedAction()` and
 * `needsActionRegion()` go through it, so the two cannot drift.
 */
function standingFor(input: ArenaHierarchyInput): ViewerStanding {
  const { role, signedIn = true, isMember = true, hasSideVote, roomFull, roomFullOnUpgrade } = input;
  return {
    kind: !signedIn ? 'signed_out' : isMember ? 'member' : 'non_member',
    role,
    hasSideVote: hasSideVote === true,
    hasArgumentVote: false,
    roomFull: roomFull === true,
    roomFullOnUpgrade: roomFullOnUpgrade === true,
  };
}

/**
 * The action the viewer is being invited to take, if any.
 *
 * Exactly one region owns the primary action in each phase, which is what stops
 * a screen from presenting three competing calls to action.
 */
export function permittedAction(input: ArenaHierarchyInput): PermittedAction {
  const { phase, hasNextClash = false, signedIn = true } = input;

  // Signed-out viewers can still read a room; they just cannot act in it.
  if (!signedIn) return 'watch';

  /*
   * This function used to *re-derive* eligibility from `(phase, role, mayJudge)`.
   * That is exactly the review's issue 3: `mayJudge` was computed by the screen
   * (`role === 'debater' && !hasSideVote`), the server independently applied
   * `submit_arena_side_vote`'s rules, and the two disagreed — so the UI advertised
   * ballots the RPC would always reject.
   *
   * It now defers to `primaryRoomAction()`, the same function the action region
   * renders from, so the label, the button and the RPC cannot diverge. The
   * `mayJudge` flag is deliberately ignored: only membership plus recorded-vote
   * state decide whether a ballot is offered.
   */
  const offer = primaryRoomAction(phase, standingFor(input));

  switch (offer.action) {
    case 'argue':
      return 'argue';
    case 'final_argument':
      return 'final_argument';
    case 'upgrade_to_debater':
      return 'join_side';
    case 'watch':
      // A non-member may be admitted as a spectator; that is still not an
      // in-room action, so the hierarchy treats it as watching.
      return 'watch';
    case 'sign_in':
      return 'watch';
    case 'none':
      // A settled room can still offer the next clash, which lives outside the
      // ballot model and so is taken from the caller.
      if (phase === 'SETTLED') return hasNextClash ? 'start_next' : 'watch';
      // CANCELLED is terminal; every live phase with no ballot offer is readable.
      return phase === 'CANCELLED' ? 'none' : 'watch';
  }
}

/** Human label for the action, used by the action region and by tests. */
export function permittedActionLabel(action: PermittedAction): string {
  switch (action) {
    case 'argue':
      return 'Make your argument';
    case 'final_argument':
      return 'Final argument';
    case 'vote':
      return 'Cast your verdict';
    case 'join_side':
      return 'Pick a side';
    case 'watch':
      return 'Follow the clash';
    case 'start_next':
      return 'Next clash';
    case 'none':
      return '';
  }
}

/**
 * The ordered region plan for a room.
 *
 * This is the single source of truth for both the room screens and the preview
 * renders — the previews are generated from the same function the app uses, so
 * they cannot drift into a prettier fiction.
 */
/**
 * True when the room owes the viewer an explicit statement about acting.
 *
 * The Phase 2 rule was "a spectator gets no action region in FINAL_ARGUMENTS or
 * JUDGING", on the theory that an absent region is better than an empty one. The
 * review showed the flaw: in JUDGING a spectator was shown *nothing*, so they could
 * not tell whether they had been excluded or whether the app had broken. Silence
 * is not the same as absence.
 *
 * The region is now present whenever the viewer could plausibly act **or has a fact
 * to report**, and the region itself renders either a control or a sentence. So
 * "no ballot for you" is stated, not omitted — and a settled room, where the result
 * region already owns the screen, still reserves nothing.
 */
export function needsActionRegion(input: ArenaHierarchyInput): boolean {
  const { phase, role, signedIn = true, isMember, hasSideVote, roomFull } = input;
  // Signed-out readers get the room, not a pseudo-action: every offer would end at
  // an auth wall, and building an in-room sign-in flow is out of scope here.
  if (!signedIn) return false;

  const standing = standingFor(input);

  // There is a real control to offer.
  if (primaryRoomAction(phase, standing).action !== 'none') return true;

  // There is a fact the viewer is owed:
  //   JUDGING — a member who may not vote (a spectator, or a debater who has
  //             already voted) is owed the reason, since the ballot panel is on
  //             screen and its absence would be ambiguous.
  //   OPEN    — a non-member needs the invitation to be admitted.
  if (phase === 'JUDGING' && standing.kind === 'member') return true;
  if (phase === 'OPEN' && standing.kind !== 'member') return true;

  // FINAL_ARGUMENTS, SETTLED and CANCELLED with nothing to offer stay silent: the
  // floor and the result regions already answer the viewer's question.
  return false;
}

export function arenaRegionPlan(input: ArenaHierarchyInput): RegionPlan[] {
  const { phase, role } = input;
  const action = permittedAction(input);
  const plan: RegionPlan[] = [];

  // 1. Phase always comes first: it is the answer to "what is happening?".
  plan.push({ region: 'phase', key: 'phase', lens: 'official', emphasis: phase === 'SETTLED' ? 1 : 2 });

  // 2. The proposition. In the OPEN phase it is the loudest thing on screen
  //    because it is what the argument is about; once settled, the result
  //    outranks it and the proposition steps back to context.
  plan.push({ region: 'subject', key: 'subject', lens: 'official', emphasis: phase === 'SETTLED' ? 1 : 3 });

  // 3. The action, immediately after what it acts on.
  //
  //    The region is present whenever `needsActionRegion()` says the viewer is owed
  //    a statement, and the region renders a control OR a sentence — never a dead
  //    button. That replaced a rule which simply omitted the region for spectators
  //    in JUDGING, leaving them unable to tell "you may not vote" from "the app is
  //    broken". Picking a side is a lighter gesture than writing an argument, so it
  //    is deliberately one step down in weight.
  if (needsActionRegion(input)) {
    const primary = action === 'argue' || action === 'final_argument' || action === 'vote';
    plan.push({ region: 'action', key: 'action', lens: 'official', emphasis: primary ? 3 : 2 });
  }

  // 4. The floor. Same region, different lens: officials for fighters, the crowd
  //    for spectators. This is the heart of "distinct experiences, one grammar".
  if (phase !== 'SETTLED') {
    const audience = floorIsCrowd(role) ? 'crowd' : 'transcript';
    plan.push({
      region: 'floor',
      key: 'floor',
      lens: audience === 'crowd' ? 'crowd' : 'official',
      floor: audience,
      // A fighter's transcript is the substance of the clash; a spectator's crowd
      // layer is the room's atmosphere. Both matter, so both sit at 2.
      emphasis: 2,
    });
  }

  // 5. The result. The verdict outranks everything once it exists, which is why
  //    it is last in source order but given the top emphasis — a long transcript
  //    above it must not bury the outcome.
  if (phase === 'SETTLED' || phase === 'CANCELLED') {
    plan.push({ region: 'result', key: 'result', lens: 'verdict', emphasis: 3 });
  }

  return plan;
}

/**
 * Which region may carry the primary (filled) call to action.
 *
 * Returns at most one region. A second filled button anywhere on the screen is a
 * hierarchy bug, and this makes that checkable rather than a matter of taste.
 */
export function primaryActionRegion(input: ArenaHierarchyInput): HierarchyRegion | null {
  const action = permittedAction(input);
  if (action === 'none' || action === 'watch') return null;
  const plan = arenaRegionPlan(input);
  return plan.some((p) => p.region === 'action') ? 'action' : null;
}

/**
 * The one-line status a participant should read first.
 *
 * Kept short deliberately: it is rendered as an eyebrow above the proposition, in
 * the type ramp's `kicker` step, so it must survive a 320dp screen at 2x text.
 */
export function phaseHeadline(phase: RoomPhase, role: ViewerRole): string {
  switch (phase) {
    case 'OPEN':
      return role === 'debater' ? 'THE FLOOR IS YOURS' : 'THE FLOOR IS OPEN';
    case 'FINAL_ARGUMENTS':
      return role === 'debater' ? 'FINAL ARGUMENT' : 'FINAL ARGUMENTS';
    case 'JUDGING':
      return 'JUDGING IN PROGRESS';
    case 'SETTLED':
      return 'VERDICT';
    case 'CANCELLED':
      return 'ROOM CLOSED';
  }
}

/** How much of the phase is behind us, for the progress rail. */
export function phaseProgress(phase: RoomPhase): number {
  switch (phase) {
    case 'OPEN':
      return 0.25;
    case 'FINAL_ARGUMENTS':
      return 0.5;
    case 'JUDGING':
      return 0.75;
    case 'SETTLED':
      return 1;
    case 'CANCELLED':
      return 0;
  }
}

/**
 * Whether the crowd layer is the viewer's primary content.
 *
 * Spectators read the crowd; fighters read the transcript. Expressing this as a
 * function keeps the two experiences distinct in one place instead of relying on
 * each screen to remember.
 */
export function floorIsCrowd(role: ViewerRole): boolean {
  return role === 'spectator';
}

/**
 * Map a topic's phase to the room phase vocabulary the hierarchy uses.
 *
 * The service exposes two vocabularies — `ArenaPhase` on topics
 * (`open`/`final_arguments`/`judging`/`closed`, lowercase) and `ArenaRoomStatus`
 * on rooms (`OPEN`/…, uppercase). Screens that mix them up render the wrong
 * headline: a topic in `judging` was previously labelled "live clash".
 *
 * A `closed` topic is *not* automatically settled — it may have been cancelled,
 * and the caller knows which from the room record. This maps `closed` to
 * `SETTLED` only because that is the common case; callers holding a room status
 * should pass that instead.
 */
export function roomPhaseForTopicPhase(phase: 'scheduled' | 'open' | 'final_arguments' | 'judging' | 'closed'): RoomPhase {
  switch (phase) {
    case 'scheduled':
      return 'OPEN';
    case 'open':
      return 'OPEN';
    case 'final_arguments':
      return 'FINAL_ARGUMENTS';
    case 'judging':
      return 'JUDGING';
    case 'closed':
      return 'SETTLED';
  }
}
