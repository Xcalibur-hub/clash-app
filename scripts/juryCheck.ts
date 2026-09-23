import { JURY_SIZE, calculateResult, selectJurors, submitJudgement } from '../services/juryService';
import { awardForJudgement } from '../services/reputationService';

/**
 * Sanity check for the mock jury + reputation engine (spec §9–§11).
 *
 * Run with:  npm run jury:check
 *
 * It asserts the invariants the UI depends on: nine jurors, no debaters on the
 * jury, a believable ballot spread, deterministic selection, correct alignment
 * maths and the §11 win total of 120 XP.
 */

const CLASH_IDS = [
  'clash-t-pixel',
  'clash-t-flagship',
  'clash-t-trailers',
  'clash-t-degree',
  'clash-t-monsoon',
  'clash-t-matchmaking',
  'clash-t-distribution',
  'clash-t-highlights',
  'clash-t-iphone-price',
  'clash-t-viewer-sleep',
  'clash-t-viewer-placements',
];

const EXCLUDED = ['u-maya', 'u-liam'];

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean): void {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.log(`  FAIL  ${label}`);
  }
}

for (const clashId of CLASH_IDS) {
  const jurors = selectJurors(clashId, { excludeUserIds: EXCLUDED });
  const summary = calculateResult(jurors);
  const votes = jurors.map((juror) => juror.vote);
  const top = Math.max(summary.score.a, summary.score.b);

  check(`${clashId}: seats ${JURY_SIZE} jurors`, jurors.length === JURY_SIZE);
  check(`${clashId}: every juror is unique`, new Set(jurors.map((j) => j.id)).size === jurors.length);
  check(`${clashId}: no debater sits on the jury`, jurors.every((j) => !EXCLUDED.includes(j.id)));
  check(`${clashId}: ballots sum to the jury size`, summary.score.a + summary.score.b === JURY_SIZE);
  check(`${clashId}: only A/B ballots exist`, votes.every((vote) => vote === 'A' || vote === 'B'));
  check(`${clashId}: winner has 5-7 of 9`, top >= 5 && top <= 7);
  check(`${clashId}: a minority always exists`, Math.min(summary.score.a, summary.score.b) >= 2);
  check(`${clashId}: agreement is plausible`, summary.agreement > 0.5 && summary.agreement < 1);
  check(`${clashId}: verdict label set`, summary.verdict.length > 0);
  check(`${clashId}: margin consistent`, summary.margin === Math.abs(summary.score.a - summary.score.b));

  // Determinism: the same Clash must always convene the same jury.
  const rerun = selectJurors(clashId, { excludeUserIds: EXCLUDED });
  check(
    `${clashId}: selection is deterministic`,
    rerun.every((juror, index) => juror.id === jurors[index].id && juror.vote === jurors[index].vote),
  );

  // Alignment maths.
  const called = submitJudgement(jurors, summary.winningSide);
  check(`${clashId}: matching ballot is a majority`, called.alignment === 'majority');
  const opposite = summary.winningSide === 'A' ? 'B' : 'A';
  check(
    `${clashId}: opposite ballot is a minority`,
    submitJudgement(jurors, opposite).alignment === 'minority',
  );
  check(
    `${clashId}: undecided abstains`,
    submitJudgement(jurors, 'UNDECIDED').alignment === 'abstained',
  );
}

// §11 economy contract.
const win = awardForJudgement('majority', 8420);
const dissent = awardForJudgement('minority', 8420);
const abstained = awardForJudgement('abstained', 8420);

check('a won clash pays the documented 120 XP', win.reputation === 120);
check('a win pays 40 coins', win.coins === 40);
check('minority pays less than a win', dissent.reputation < win.reputation);
check('abstaining pays less than a dissenting ballot', abstained.reputation < dissent.reputation);
check('ledger lines add up to the total', win.events.reduce((t, e) => t + e.delta, 0) === win.reputation);
check('progress is a ratio', win.progressBefore >= 0 && win.progressAfter <= 1);

// Rank transitions (Firestarter spans 2,400–10,999 XP).
const nearRankUp = awardForJudgement('majority', 10_950);
check('crossing a tier reports a rank up', nearRankUp.rankedUp && nearRankUp.rankAfter === 'Provocateur');
check('a rank up starts the new tier', nearRankUp.progressAfter < 0.2);
const midTier = awardForJudgement('majority', 5000);
check('same tier keeps the rank', !midTier.rankedUp && midTier.rankAfter === 'Firestarter');
check('same tier advances the bar', midTier.progressAfter > midTier.progressBefore);

console.log(failures === 0 ? `\nPASS — ${checks} checks` : `\nFAILED — ${failures}/${checks} checks`);
process.exit(failures === 0 ? 0 : 1);
