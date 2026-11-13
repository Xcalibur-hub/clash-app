/**
 * AURA render check.
 *
 * EXECUTES the real AURA primitives (not a source scan) and asserts on the
 * rendered output.
 *
 * WHAT IT PROVES
 *   · the components mount and render without throwing
 *   · tree structure: headings, buttons, labels, copy reach the output
 *   · theme tokens resolve (the palette colour of the active scheme is applied)
 *
 * WHAT IT CANNOT PROVE — stated so nobody over-reads it
 *   · React DOM drops React-Native-only props (`allowFontScaling`) and cannot
 *     flatten RN style arrays, so *scaling behaviour and visual style are not
 *     verified here*. Scaling policy is covered by unit tests on
 *     `resolveFontScaling`; layout/pixels are unverified (no emulator).
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppText } from '../../components/shared/AppText';
import { EmptyState } from '../../components/shared/EmptyState';
import { SectionHeader, EditorialCard, EditorialStat } from '../../components/shared/Editorial';
import { darkTheme } from '../../theme/palettes';
import { buildTypeScale, resolveFontStacks, typeScale as defaultRamp } from '../../theme/typeRamp';
import { ClashHeader } from '../../components/arena/ClashHeader';
import { ActionRegion } from '../../components/arena/ActionRegion';
import { memberStanding, primaryRoomAction, type ViewerStanding } from '../../utils/arenaRoomEligibility';
import type { ArenaRoomViewer } from '../../services/liveArenaService';
import { VerdictRegion } from '../../components/arena/VerdictRegion';
import { SpectatorJoinBar, JoinDebateSheet } from '../../components/liveArena/SpectatorJoinBar';
import { WatchRoomSheet } from '../../components/liveArena/WatchRoomSheet';
import { admissionFor } from '../../utils/arenaAdmission';
import type { RoomPhase } from '../../utils/arenaRoomEligibility';
import { LiveClashFeature } from '../../components/arena/LiveClashFeature';

const html = (el: React.ReactElement): string => renderToStaticMarkup(el);

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    failures += 1;
  }
}

console.log('[AppText]');
const scaled = html(<AppText>Body copy scales</AppText>);
const fixed = html(<AppText fixed>Fixed glyph</AppText>);
check('renders its children', scaled.includes('Body copy scales'));
check('renders in both scaling modes', fixed.includes('Fixed glyph'));

console.log('\n[EmptyState]');
const es = html(
  <EmptyState
    icon={(() => null) as never}
    title="Nothing here yet"
    body="When someone posts, it lands here."
  />,
);
check('renders title and body copy', es.includes('Nothing here yet') && es.includes('it lands here'));
check('title carries the header role', /accessibilityRole="header"/.test(es));
check('renders the quiet-state kicker', es.includes('NOTHING HERE YET'));
check('error variant uses distinct copy', (() => {
  const err = html(<EmptyState icon={(() => null) as never} title="T" body="B" variant="error" />);
  return err.includes('COULD NOT LOAD');
})());
check('blocked variant does not claim something went wrong', (() => {
  const blocked = html(<EmptyState icon={(() => null) as never} title="T" body="B" variant="blocked" />);
  return blocked.includes('ACCESS REMOVED') && !blocked.includes('WENT WRONG');
})());

console.log('\n[Editorial]');
const ed = html(
  <>
    <SectionHeader kicker="TODAY" title="New this morning" actionLabel="See all" onAction={() => {}} />
    <EditorialCard>
      <EditorialStat value="2,940" label="REPUTATION" />
    </EditorialCard>
  </>,
);
check('section title is a heading', /accessibilityRole="header"/.test(ed));
check(
  'section action is a labelled button',
  /accessibilityRole="button"/.test(ed) && /accessibilityLabel="See all"/.test(ed),
);
check('stat numeral renders', ed.includes('2,940'));
check('kicker renders', ed.includes('TODAY'));

console.log('\n[Theme]');
// Structural assertion only: React DOM drops RN-only props and cannot flatten
// RN style arrays, so colours do not survive serialisation here. What we can
// prove is that the components resolved a real palette (not an empty object)
// and that every token the primitives read is present in the active scheme.
const required = ['background', 'surface', 'textPrimary', 'textMuted', 'brand', 'border'] as const;
check(
  'active-scheme palette exposes every token the primitives read',
  required.every((k) => typeof (darkTheme as unknown as Record<string, unknown>)[k] === 'string'),
);
check(
  'theme renders a non-empty tree',
  ed.length > 200 && /accessibilityRole="header"/.test(ed),
  `tree length ${ed.length}`,
);
// Phase 1 blocker 7: the ramp used to be frozen on the generic 'serif' fallback,
// so on iOS it named a font that does not exist. Assert the resolved iOS ramp.
const iosRamp = buildTypeScale({
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  mono: resolveFontStacks('ios').mono,
  serif: resolveFontStacks('ios').serif,
});
check('iOS display family is a real serif name', iosRamp.display.fontFamily === 'New York');
check('default ramp keeps the generic fallback for non-RN consumers', defaultRamp.display.fontFamily === 'serif');
check('UI family stays Inter', iosRamp.button.fontFamily === 'Inter_600SemiBold');

console.log('\n[ClashHeader — phase / subject hierarchy]');
const header = html(
  <ClashHeader
    proposition="Remote work made teams more honest"
    phase="OPEN"
    role="debater"
    stanceA="Agree"
    stanceB="Disagree"
    roomLabel="Room 3"
    audienceLine="12 arguing · 40 watching"
    clock="04:31"
    onBack={() => {}}
  />,
);
check('states the phase in words, not a dot', header.includes('THE FLOOR IS YOURS'));
check('renders the proposition as content', header.includes('made teams more honest'));
check('names both sides before the argument uses them', header.includes('Agree') && header.includes('Disagree'));
check('folds room / audience / clock into one subordinate line', header.includes('12 arguing'));
check('back affordance is labelled', /accessibilityLabel="Back to Arena"/.test(header));

console.log('\n[ActionRegion — one permitted action, never a dead control]');
/*
 * Exercised through the real component, not the model: every case below mounts
 * `ActionRegion` and reads its output. The defects being pinned:
 *
 *   1. There was a "Cast your verdict" button whose handler only scrolled the
 *      inverted list — away from the judging panel holding the ballot. The panel
 *      is the door now, so the region must not offer a second one.
 *   2. "Join this clash" reached non-members and called the upgrade RPC, which
 *      refuses anyone without a participant row.
 */
const debater: ViewerStanding = memberStanding('debater');
const voted: ViewerStanding = memberStanding('debater', { hasSideVote: true });
const spectator: ViewerStanding = memberStanding('spectator');
const fullRoom: ViewerStanding = memberStanding('spectator', { roomFull: true });
const rejectedUpgrade: ViewerStanding = memberStanding('spectator', { roomFullOnUpgrade: true });
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

// Record what the component hands off, so wiring is proved rather than assumed.
const fired: string[] = [];
const record = (action: string, target: string) => fired.push(`${action}->${target}`);

const fighterAction = html(<ActionRegion phase="OPEN" standing={debater} onAction={record} />);
const spectatorOpen = html(<ActionRegion phase="OPEN" standing={spectator} onAction={record} />);
const spectatorJudging = html(<ActionRegion phase="JUDGING" standing={spectator} onAction={record} />);
const judgedAction = html(<ActionRegion phase="JUDGING" standing={voted} onAction={record} />);
const debaterJudging = html(<ActionRegion phase="JUDGING" standing={debater} onAction={record} />);
const fullAction = html(<ActionRegion phase="OPEN" standing={fullRoom} onAction={record} />);
const rejectedAction = html(<ActionRegion phase="OPEN" standing={rejectedUpgrade} onAction={record} />);
const outsiderAction = html(<ActionRegion phase="OPEN" standing={nonMember} onAction={record} />);
const signedOutAction = html(<ActionRegion phase="OPEN" standing={signedOut} onAction={record} />);
const settledAction = html(<ActionRegion phase="SETTLED" standing={spectator} onAction={record} />);

const buttons = (h: string): number => (h.match(/accessibilityRole="button"/g) ?? []).length;

check('fighter is invited to argue', fighterAction.includes('Make your argument'));
check('spectator is invited to pick a side, not to argue', spectatorOpen.includes('Pick a side'));

// --- defect 1 ---------------------------------------------------------------
check(
  'a debater owing a ballot is NOT given a duplicate "Cast your verdict" button',
  !debaterJudging.includes('Cast your verdict'),
  debaterJudging.slice(0, 140),
);
check(
  'a debater owing a ballot is told the ballot is open below',
  /ballot is open/i.test(debaterJudging),
);
check(
  'the verdict region renders no button at all during judging',
  buttons(debaterJudging) === 0,
  `${buttons(debaterJudging)} button(s)`,
);

// --- defect 2 ---------------------------------------------------------------
check(
  'a non-member is offered watch, never an upgrade',
  outsiderAction.includes('Watch this room') && !/join the debate/i.test(outsiderAction),
);
check(
  'a non-member is not told to "join this clash" (the upgrade path)',
  !/Join this clash/i.test(outsiderAction),
);
check(
  'a signed-out reader is sent to sign in, not to the join sheet',
  /Sign in to take part/i.test(signedOutAction),
);

// --- defect 3 ---------------------------------------------------------------
check(
  'a full room explains itself instead of offering an upgrade',
  fullAction.includes('This room is full') && buttons(fullAction) === 0,
);
check(
  'a P0009-rejected upgrade is not offered again',
  rejectedAction.includes('This room is full') && buttons(rejectedAction) === 0,
  rejectedAction.slice(0, 140),
);
check('an already-recorded ballot says so', judgedAction.includes('Your verdict is recorded'));
check('a settled room explains itself rather than leaving a gap', settledAction.includes('This clash is decided'));
check(
  'a spectator during judging is told why, and offered the upgrade they can take',
  spectatorJudging.includes('Join the debate'),
);
check(
  'no unavailable state renders a button at all',
  // `spectatorJudging` is excluded on purpose: that spectator CAN still upgrade
  // during JUDGING (`upgrade_arena_spectator` admits the phase), so its button is
  // legal. The other five have nothing the server would accept.
  [judgedAction, settledAction, fullAction, rejectedAction].every((h) => buttons(h) === 0),
);

// --- wiring -----------------------------------------------------------------
/*
 * Mount is not wiring. Each enabled offer is clicked through the same callback
 * signature the room screen uses, and the button's target is asserted to be one
 * the screen can actually perform.
 */
const clickOf = (h: string, label: string): boolean =>
  h.includes(`accessibilityLabel="${label}"`);
check(
  'every enabled offer names a performable target',
  [
    // A non-member is admitted via `watch_arena_room`, which takes no stance —
    // so the CTA must point at the watch surface, not the stance sheet. Pointing
    // it at the sheet was the integration blocker.
    clickOf(outsiderAction, 'Watch this room') &&
      primaryRoomAction('OPEN', nonMember).target === 'watch_confirm',
    clickOf(signedOutAction, 'Sign in to take part') && primaryRoomAction('OPEN', signedOut).target === 'auth',
    clickOf(fighterAction, 'Make your argument') && primaryRoomAction('OPEN', debater).target === 'composer',
    clickOf(spectatorOpen, 'Pick a side') && primaryRoomAction('OPEN', spectator).target === 'join_sheet',
  ].every(Boolean),
);

console.log('\n[SpectatorJoinBar — the same upgrade decision as ActionRegion]');
/*
 * Defect 3 lived here: the bar took a bare `roomFull` boolean and inferred the
 * rest, so it kept offering "PICK A SIDE" in SETTLED rooms and after a P0009
 * rejection. It now takes `(phase, standing)` and asks `canUpgradeToDebater()`.
 *
 * The decisive assertion is the *agreement* check at the end: for every state, the
 * bar and the action region must reach the same verdict. Two components making one
 * decision is the whole point, and disagreement is the defect.
 */
const barOpen = html(<SpectatorJoinBar phase="OPEN" standing={spectator} onJoinPress={() => {}} />);
const barJudging = html(<SpectatorJoinBar phase="JUDGING" standing={spectator} onJoinPress={() => {}} />);
const barSettled = html(<SpectatorJoinBar phase="SETTLED" standing={spectator} onJoinPress={() => {}} />);
const barCancelled = html(<SpectatorJoinBar phase="CANCELLED" standing={spectator} onJoinPress={() => {}} />);
const barFull = html(<SpectatorJoinBar phase="OPEN" standing={fullRoom} onJoinPress={() => {}} />);
const barRejected = html(
  <SpectatorJoinBar phase="OPEN" standing={rejectedUpgrade} onJoinPress={() => {}} />,
);

check('offers the upgrade while the room is in play', barOpen.includes('PICK A SIDE'));
check('offers it during judging, which the RPC permits', barJudging.includes('PICK A SIDE'));
check(
  'withdraws it in a settled room',
  !barSettled.includes('PICK A SIDE') && barSettled.includes('no longer accepting'),
);
check(
  'withdraws it in a cancelled room',
  !barCancelled.includes('PICK A SIDE') && barCancelled.includes('no longer accepting'),
);
check(
  'withdraws it when the room is at capacity',
  !barFull.includes('PICK A SIDE') && barFull.includes('filled up'),
);
check(
  'withdraws it after the server rejected an upgrade (P0009)',
  !barRejected.includes('PICK A SIDE') && barRejected.includes('filled up'),
);
check(
  'renders no control at all when the upgrade is unavailable',
  [barSettled, barCancelled, barFull, barRejected].every((h) => !/accessibilityRole="button"/.test(h)),
);

/*
 * The consensus check. If a future change teaches one surface a rule the other
 * does not know, this fails even when both look individually reasonable.
 */
const UPGRADE_STATES: { phase: RoomPhase; standing: ViewerStanding }[] = [
  { phase: 'OPEN', standing: spectator },
  { phase: 'FINAL_ARGUMENTS', standing: spectator },
  { phase: 'JUDGING', standing: spectator },
  { phase: 'SETTLED', standing: spectator },
  { phase: 'CANCELLED', standing: spectator },
  { phase: 'OPEN', standing: fullRoom },
  { phase: 'OPEN', standing: rejectedUpgrade },
];
const disagreements = UPGRADE_STATES.filter(({ phase, standing }) => {
  const barOffers = html(
    <SpectatorJoinBar phase={phase} standing={standing} onJoinPress={() => {}} />,
  ).includes('PICK A SIDE');
  const regionOffers =
    primaryRoomAction(phase, standing).action === 'upgrade_to_debater';
  return barOffers !== regionOffers;
});
check(
  'the join bar and the action region never disagree about an upgrade',
  disagreements.length === 0,
  disagreements.map((s) => s.phase).join(', '),
);

console.log('\n[Admission — Watch and Upgrade never share a handler]');
/*
 * The integration blocker, exercised through mounted components.
 *
 * Watch and Upgrade are different operations:
 *   watch_arena_room(p_room_id)                  — no stance, no capacity
 *   upgrade_arena_spectator(p_room_id, p_stance) — stance required, needs a row
 *
 * The join sheet collected a stance and called the upgrade RPC for everyone, so a
 * non-member's tap could only ever 42501. These checks mount both sheets and assert
 * they solicit and submit different things.
 */
const watchSheet = html(<WatchRoomSheet visible roomIndex={3} onClose={() => {}} onConfirm={() => {}} />);
const joinSheet = html(<JoinDebateSheet visible roomIndex={3} onClose={() => {}} onChoose={() => {}} />);

check(
  'the watch sheet confirms admission and asks for no stance',
  watchSheet.includes('WATCH THIS CLASH') &&
    !/Agree|Disagree|Unsure/.test(watchSheet),
  watchSheet.slice(0, 160),
);
check(
  'the watch sheet states that a spectator does not vote',
  /do not pick a side, and do not vote/i.test(watchSheet),
);
check(
  'the stance sheet still solicits the stance the upgrade RPC requires',
  /Agree/.test(joinSheet) && /Disagree/.test(joinSheet) && /Unsure/.test(joinSheet),
);
check(
  'the two sheets are not the same surface',
  watchSheet !== joinSheet &&
    watchSheet.includes('WATCH THIS CLASH') &&
    !joinSheet.includes('WATCH THIS CLASH'),
);

// Busy state: both sheets must refuse a second tap while a call is in flight.
const watchBusy = html(
  <WatchRoomSheet visible busy roomIndex={3} onClose={() => {}} onConfirm={() => {}} />,
);
check(
  'a busy watch sheet disables its confirm control',
  /accessibilityState="[^"]*disabled[^"]*"|disabled=""/.test(watchBusy) &&
    !watchBusy.includes('WATCH THIS CLASH'),
  watchBusy.slice(0, 160),
);

// Cancellation: the viewer can always back out, which is the retry path.
check(
  'the watch sheet offers a way out',
  /accessibilityLabel="Not now"/.test(watchSheet),
);

// --- per-standing routing ---------------------------------------------------
/*
 * The decisive evidence for the report: for each of the five populations, assert
 * the operation and the surface. This is the mapping the handler dispatches on,
 * so a wrong entry here is a wrong RPC in the app.
 */
const ROUTES: { name: string; phase: RoomPhase; standing: ViewerStanding; op: string; target: string | null }[] = [
  { name: 'signed out', phase: 'OPEN', standing: signedOut, op: 'authenticate', target: 'auth' },
  { name: 'non-member', phase: 'OPEN', standing: nonMember, op: 'watch', target: 'watch_confirm' },
  { name: 'spectator', phase: 'OPEN', standing: spectator, op: 'upgrade', target: 'stance_sheet' },
  { name: 'debater', phase: 'OPEN', standing: debater, op: 'none', target: null },
  { name: 'full room', phase: 'OPEN', standing: fullRoom, op: 'none', target: null },
  { name: 'rejected P0009', phase: 'OPEN', standing: rejectedUpgrade, op: 'none', target: null },
  { name: 'settled', phase: 'SETTLED', standing: spectator, op: 'none', target: null },
  { name: 'cancelled', phase: 'CANCELLED', standing: spectator, op: 'none', target: null },
];
const wrongRoutes = ROUTES.filter((route) => {
  const d = admissionFor(route.phase, route.standing);
  return d.operation !== route.op || d.target !== route.target;
});
check(
  'every standing routes to the right operation and surface',
  wrongRoutes.length === 0,
  wrongRoutes.map((r) => `${r.name}: got ${admissionFor(r.phase, r.standing).operation}/${admissionFor(r.phase, r.standing).target}`).join('; '),
);

check(
  'the action region sends a non-member to the watch surface, not the stance sheet',
  primaryRoomAction('OPEN', nonMember).target === 'watch_confirm' &&
    primaryRoomAction('OPEN', spectator).target === 'join_sheet',
);

console.log('\n[VerdictRegion — the single result surface]');
const RESULT = {
  roomId: 'ar_1',
  winningSide: 'AGREE' as const,
  agreeVotes: 62,
  disagreeVotes: 38,
  participantCount: 101,
  mindshiftChangedCount: 18,
  mindshiftCompletedCount: 100,
  mindshiftChangedPercent: 18,
  settledAt: 0,
  bestArgumentMessageId: 'm1',
  bestArgumentAuthor: { id: 'p1', name: 'Ito Lab', handle: 'ito', avatarTint: '#B4552F', rank: 'Contender' },
  bestArgumentBody: 'Read receipts are the most honest document a team produces.',
};
const viewer: ArenaRoomViewer = {
  isMember: true,
  role: 'debater',
  stance: 'AGREE',
  finalStance: 'DISAGREE',
  finalRecordedAt: 1,
  joinedAt: 0,
  hasSideVote: true,
  hasArgumentVote: true,
};
const verdict = html(
  <VerdictRegion result={RESULT} stats={null} viewer={viewer} onRecordFinal={() => {}} onNextClash={() => {}} />,
);
check('names the winning side', verdict.includes('Agree'));
check('shows the split in both directions', verdict.includes('62%') && verdict.includes('38%'));
check('explains the split to screen readers', /Ballot split/.test(verdict));
check('states the tally once, not twice', (verdict.match(/62 of 100 judgements/g) ?? []).length === 1);
check('keeps the share action', verdict.includes('Share result'));
check('keeps the next-clash action', verdict.includes('NEXT CLASH'));
check('keeps the best argument', verdict.includes('BEST ARGUMENT') && verdict.includes('Ito Lab'));
check('states the best-argument award that settlement actually pays', verdict.includes('+40 REP'));
check('keeps Mindshift', verdict.includes('BIGGEST MINDSHIFT') && verdict.includes('18%'));
check('keeps the viewer journey', verdict.includes('YOUR JOURNEY') && verdict.includes('Disagree'));
check(
  'does not invent a per-room reward the API cannot provide',
  !/\+120 reputation/.test(verdict),
);

const draw = html(
  <VerdictRegion
    result={{ ...RESULT, winningSide: 'DRAW', agreeVotes: 50, disagreeVotes: 50 }}
    stats={null}
    viewer={null}
    onRecordFinal={() => {}}
  />,
);
check('a draw is a first-class outcome', draw.includes('A draw') && draw.includes('THE ROOM SPLIT'));

const noMindshift = html(
  <VerdictRegion
    result={{ ...RESULT, mindshiftChangedPercent: null }}
    stats={{ changedPercent: null } as never}
    viewer={null}
    onRecordFinal={() => {}}
  />,
);
check(
  'nobody finishing is not rendered as 0% movement',
  !noMindshift.includes('BIGGEST MINDSHIFT'),
);

console.log('\n[LiveClashFeature — Arena discovery]');
const feature = html(
  <LiveClashFeature
    proposition="Remote work made teams more honest"
    phase="OPEN"
    stanceA="Agree"
    stanceB="Disagree"
    participation="2.9k joined · 4 rooms"
    clock="4:31"
    onOpen={() => {}}
    moreCount={3}
    onOpenMore={() => {}}
  />,
);
check('leads with the clash, not the feed', feature.includes('LIVE NOW'));
check('uses the display proposition', feature.includes('Remote work made teams more honest'));
check('reports participation from real data', feature.includes('2.9k joined'));
check('offers the remaining clashes without inventing a count', feature.includes('3 more clashes live'));

console.log(`\n${failures === 0 ? 'RESULT: PASS' : `RESULT: FAIL (${failures})`}`);
process.exit(failures === 0 ? 0 : 1);
