/** Verdict presentation guards — authoritative outcomes only. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { verdictView } from './verdictView.ts';
import type { ArenaDuel } from './arenaDuelPayload';

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
  verdict: { winnerSide: 'A', jurySize: 4, verdictLabel: 'SPLIT DECISION', sideAScore: 3, sideBScore: 1 },
  ...overrides,
});

describe('verdict view', () => {
  it('reports a Side A win from the authoritative winner field', () => {
    const view = verdictView(duel());
    assert.equal(view.kind, 'settled');
    assert.equal(view.winnerSide, 'A');
    assert.equal(view.winnerLabel, 'SIDE A · Kevin');
    assert.equal(view.title, 'Kevin made the stronger case');
    assert.equal(view.aPct, 75);
    assert.equal(view.bPct, 25);
    assert.equal(view.juryLabel, '4 judgments · SPLIT DECISION');
  });

  it('reports a Side B win', () => {
    const view = verdictView(
      duel({
        verdict: { winnerSide: 'B', jurySize: 3, verdictLabel: 'UNANIMOUS', sideAScore: 0, sideBScore: 3 },
      }),
    );
    assert.equal(view.winnerLabel, 'SIDE B · Rohan');
    assert.equal(view.title, 'Rohan made the stronger case');
    assert.equal(view.aPct, 0);
    assert.equal(view.bPct, 100);
  });

  it('reports a tie without inventing a winner', () => {
    const view = verdictView(
      duel({ verdict: { winnerSide: 'DRAW', jurySize: 2, verdictLabel: 'DRAW', sideAScore: 1, sideBScore: 1 } }),
    );
    assert.equal(view.winnerLabel, 'DRAW');
    assert.equal(view.title, 'Draw');
    assert.equal(view.aPct, 50);
    assert.equal(view.bPct, 50);
  });

  it('keeps the winner authoritative even when percentages look tied', () => {
    // 1 of 2 vs 1 of 2 rounds to 50/50, but the verdict says B.
    const view = verdictView(
      duel({ verdict: { winnerSide: 'B', jurySize: 2, verdictLabel: 'SPLIT DECISION', sideAScore: 1, sideBScore: 1 } }),
    );
    assert.equal(view.winnerSide, 'B');
    assert.equal(view.winnerLabel, 'SIDE B · Rohan');
  });

  it('omits percentages when the authoritative scores are absent', () => {
    const view = verdictView(duel({ verdict: { winnerSide: 'A', jurySize: 5, verdictLabel: 'SPLIT DECISION' } }));
    assert.equal(view.aPct, null);
    assert.equal(view.bPct, null);
    assert.equal(view.juryLabel, '5 judgments · SPLIT DECISION');
  });

  it('handles a zero-jury verdict without dividing by zero', () => {
    const view = verdictView(
      duel({ verdict: { winnerSide: 'A', jurySize: 0, verdictLabel: '', sideAScore: 0, sideBScore: 0 } }),
    );
    assert.equal(view.aPct, null);
    assert.equal(view.bPct, null);
    assert.equal(view.juryLabel, '0 judgments');
  });

  it('presents a cancelled Clash as terminal with no verdict', () => {
    const view = verdictView(duel({ status: 'cancelled', verdict: null }));
    assert.equal(view.kind, 'cancelled');
    assert.equal(view.title, 'Clash cancelled');
    assert.equal(view.winnerSide, null);
    assert.equal(view.winnerLabel, null);
    assert.match(view.support ?? '', /No verdict was issued/);
    assert.equal(view.aPct, null);
  });

  it('presents a settled-but-unresolved Clash as pending, not a win', () => {
    const view = verdictView(duel({ status: 'open', verdict: null }));
    assert.equal(view.kind, 'pending');
    assert.equal(view.title, null);
    assert.equal(view.winnerSide, null);
    assert.match(view.support ?? '', /Settlement is pending/);
  });

  it('carries the accepted positions and trims blank ones', () => {
    assert.equal(verdictView(duel()).aPosition, 'Automation should stay opt-in.');
    const blank = verdictView(duel({ sourceText: '   ', counterPosition: undefined }));
    assert.equal(blank.aPosition, '');
    assert.equal(blank.bPosition, '');
  });
});
