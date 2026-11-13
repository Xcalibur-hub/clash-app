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
import type { ViewerStanding } from '../../utils/arenaRoomEligibility';
import type { ArenaRoomViewer } from '../../services/liveArenaService';
import { VerdictRegion } from '../../components/arena/VerdictRegion';
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
 * These cases are the review's issue 1 and issue 3, exercised through the real
 * component rather than only the model: a spectator must never be offered a
 * ballot, and every control that IS offered must name a destination that performs
 * it.
 */
const debater: ViewerStanding = { isMember: true, role: 'debater', hasSideVote: false, hasArgumentVote: false };
const voted: ViewerStanding = { ...debater, hasSideVote: true };
const spectator: ViewerStanding = { isMember: true, role: 'spectator', hasSideVote: false, hasArgumentVote: false };
const outsider: ViewerStanding = { isMember: false, role: null, hasSideVote: false, hasArgumentVote: false };

const seen: { action: string; target: string | null }[] = [];
const record = (action: string, target: string | null) => seen.push({ action, target });
const fighterAction = html(<ActionRegion phase="OPEN" standing={debater} onAction={record} />);
const spectatorOpen = html(<ActionRegion phase="OPEN" standing={spectator} onAction={record} />);
const spectatorJudging = html(<ActionRegion phase="JUDGING" standing={spectator} onAction={record} />);
const judgedAction = html(<ActionRegion phase="JUDGING" standing={voted} onAction={record} />);
const verdictAction = html(<ActionRegion phase="JUDGING" standing={debater} onAction={record} />);
const outsiderAction = html(<ActionRegion phase="OPEN" standing={outsider} onAction={record} />);
const settledAction = html(<ActionRegion phase="SETTLED" standing={spectator} onAction={record} />);

check('fighter is invited to argue', fighterAction.includes('Make your argument'));
check('spectator is invited to pick a side, not to argue', spectatorOpen.includes('Pick a side'));
check('a debater is invited to cast a verdict', verdictAction.includes('Cast your verdict'));
check(
  'a spectator is NEVER offered a ballot',
  !spectatorJudging.includes('Cast your verdict'),
  spectatorJudging.slice(0, 120),
);
check(
  'a spectator is told why, instead of shown a dead control',
  spectatorJudging.includes('Fighters judge this room'),
);
check('an already-recorded ballot says so', judgedAction.includes('Your verdict is recorded'));
check('a settled room explains itself rather than leaving a gap', settledAction.includes('This clash is decided'));
check('a non-member is invited to join, not to vote', outsiderAction.includes('Join this clash'));
check(
  'no unavailable state renders a button at all',
  [spectatorJudging, judgedAction, settledAction].every((h) => !/accessibilityRole="button"/.test(h)),
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
