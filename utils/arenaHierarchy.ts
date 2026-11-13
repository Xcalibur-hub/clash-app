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

export type RoomPhase = 'OPEN' | 'FINAL_ARGUMENTS' | 'JUDGING' | 'SETTLED' | 'CANCELLED';
export type ViewerRole = 'debater' | 'spectator';

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
  /** True when the viewer may cast a ballot in this room right now. */
  mayJudge?: boolean;
  /** True when a next clash is actually available to start. */
  hasNextClash?: boolean;
  /** Signed-out viewers can watch but never act. */
  signedIn?: boolean;
}

/**
 * The action the viewer is being invited to take, if any.
 *
 * Exactly one region owns the primary action in each phase, which is what stops
 * a screen from presenting three competing calls to action.
 */
export function permittedAction(input: ArenaHierarchyInput): PermittedAction {
  const { phase, role, mayJudge = false, hasNextClash = false, signedIn = true } = input;
  // Signed-out viewers can still read a room; they just cannot act in it.
  if (!signedIn) return 'watch';

  switch (phase) {
    case 'OPEN':
      // A fighter argues; a spectator without a side is invited to pick one.
      if (role === 'debater') return 'argue';
      return 'join_side';
    case 'FINAL_ARGUMENTS':
      return role === 'debater' ? 'final_argument' : 'watch';
    case 'JUDGING':
      // Judging is the whole point of this phase; fighters who still hold a
      // ballot may vote, but the crowd's ballot is the primary action.
      return mayJudge ? 'vote' : 'watch';
    case 'SETTLED':
      return hasNextClash ? 'start_next' : 'watch';
    case 'CANCELLED':
      return 'none';
    default:
      return 'none';
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

  // 3. The action, immediately after what it acts on. Never for `none`/`watch`:
  //    a spectator has nothing to do, and a disabled-looking composer is worse
  //    than no composer. Picking a side is a lighter gesture than writing an
  //    argument, so it is deliberately one step down in weight.
  if (action === 'argue' || action === 'final_argument' || action === 'vote') {
    plan.push({ region: 'action', key: 'action', lens: 'official', emphasis: 3 });
  } else if (action === 'join_side') {
    plan.push({ region: 'action', key: 'action', lens: 'official', emphasis: 2 });
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
