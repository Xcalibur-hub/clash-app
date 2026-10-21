/** Verdict sheet structure — announcement / explanation / scores separation. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ArenaDuel } from './arenaDuelPayload.ts';
import { verdictView } from './verdictView.ts';
import {
  VERDICT_IS_NOT_SUPPORT,
  verdictEyebrow,
  verdictSheetSections,
} from './verdictPresentation.ts';

const duel = (overrides: Partial<ArenaDuel> = {}): ArenaDuel => ({
  clashId: 'clash-1',
  status: 'settled',
  fighterA: { id: 'a', name: 'Kevin', handle: 'kevin' },
  fighterB: { id: 'b', name: 'Rohan', handle: 'rohan' },
  viewerRelationship: 'spectator',
  mayJudge: false,
  hasJudged: false,
  sourceText: 'Automation should stay opt-in.',
  counterPosition: 'Automation saves real time.',
  verdict: {
    winnerSide: 'A',
    jurySize: 4,
    verdictLabel: 'SPLIT DECISION',
    sideAScore: 3,
    sideBScore: 1,
  },
  ...overrides,
});

describe('verdict presentation sections', () => {
  it('separates Side A win announcement, winner chip, jury explanation, and scores', () => {
    const view = verdictView(duel());
    const sections = verdictSheetSections(view);
    assert.equal(verdictEyebrow(view, 'settled'), 'VERDICT');
    assert.equal(sections.announcement, true);
    assert.equal(sections.winner, true);
    assert.match(sections.explanation ?? '', /4 judgments/);
    assert.equal(sections.scores, true);
  });

  it('distinguishes Side B, draw, cancelled, and pending', () => {
    const b = verdictView(
      duel({
        verdict: {
          winnerSide: 'B',
          jurySize: 3,
          verdictLabel: 'UNANIMOUS',
          sideAScore: 0,
          sideBScore: 3,
        },
      }),
    );
    assert.equal(b.winnerLabel, 'SIDE B · Rohan');
    assert.equal(verdictSheetSections(b).winner, true);

    const draw = verdictView(
      duel({
        verdict: {
          winnerSide: 'DRAW',
          jurySize: 2,
          verdictLabel: 'DRAW',
          sideAScore: 1,
          sideBScore: 1,
        },
      }),
    );
    assert.equal(draw.winnerLabel, 'DRAW');
    assert.equal(verdictSheetSections(draw).winner, true);

    const cancelled = verdictView(duel({ status: 'cancelled', verdict: null }));
    assert.equal(verdictEyebrow(cancelled, 'cancelled'), 'CANCELLED');
    assert.equal(verdictSheetSections(cancelled).winner, false);
    assert.equal(verdictSheetSections(cancelled).scores, false);
    assert.match(verdictSheetSections(cancelled).explanation ?? '', /No verdict/);

    const pending = verdictView(duel({ status: 'open', verdict: null }));
    assert.equal(verdictEyebrow(pending, 'open'), 'PENDING');
    assert.equal(verdictSheetSections(pending).announcement, false);
    assert.match(verdictSheetSections(pending).explanation ?? '', /pending/i);
  });

  it('omits score rows when canonical percentages are absent', () => {
    const view = verdictView(
      duel({ verdict: { winnerSide: 'A', jurySize: 5, verdictLabel: 'SPLIT DECISION' } }),
    );
    assert.equal(verdictSheetSections(view).scores, false);
    assert.equal(verdictSheetSections(view).winner, true);
  });

  it('never equates SUPPORT with official judgement', () => {
    assert.match(VERDICT_IS_NOT_SUPPORT, /SUPPORT/);
    assert.match(VERDICT_IS_NOT_SUPPORT, /do not count/);
    assert.doesNotMatch(VERDICT_IS_NOT_SUPPORT, /official winner.*SUPPORT/i);
  });
});
