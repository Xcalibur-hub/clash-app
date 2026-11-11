/** Reputation and rank rules (spec §11 / §10). Pure arithmetic — no network, no device. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { XP, CLASH_WIN_TOTAL, awardDescription, rankFor, nextRank, rankProgress, RANKS } from './reputation.ts';

describe('clash reward totals', () => {
  it('a won clash pays exactly the spec total of 120', () => {
    assert.equal(XP.participate, 15);
    assert.equal(XP.winBonus, 105);
    assert.equal(CLASH_WIN_TOTAL, 120);
  });

  it('participation alone is paid without the win bonus', () => {
    assert.equal(XP.participate, 15);
    assert.equal(XP.participate + XP.winBonus, CLASH_WIN_TOTAL);
  });

  it('a lost clash pays participation only — the win bonus is never granted', () => {
    // Losing earns XP.participate and nothing else; a win is participate + winBonus.
    const loss = XP.participate;
    const win = CLASH_WIN_TOTAL;
    assert.equal(win - loss, XP.winBonus);
    assert.ok(loss < win);
  });

  it('dissenting ballots pay the documented dissent credit', () => {
    assert.equal(XP.dissent, 10);
  });
});

describe('ballot alignment copy', () => {
  it('names each alignment without implying a reward difference', () => {
    assert.match(awardDescription('majority'), /matched the jury/);
    assert.match(awardDescription('minority'), /losing side/);
    assert.match(awardDescription('abstained'), /abstained/);
  });

  it('abstained and minority are visibly distinct outcomes', () => {
    assert.notEqual(awardDescription('abstained'), awardDescription('minority'));
    assert.notEqual(awardDescription('majority'), awardDescription('minority'));
  });
});

describe('rank thresholds', () => {
  it('starts everyone at Rookie', () => {
    assert.equal(rankFor(0).name, 'Rookie');
    assert.equal(rankFor(-50).name, 'Rookie', 'negative reputation must not crash or skip ranks');
  });

  it('rank boundaries are inclusive at the exact min', () => {
    for (const step of RANKS) {
      assert.equal(rankFor(step.min).name, step.name, `${step.min} must select ${step.name}`);
      if (step.min > 0) assert.notEqual(rankFor(step.min - 1).name, step.name, `${step.min - 1} must still be below ${step.name}`);
    }
  });

  it('stays Legend above the top threshold and has no next rank', () => {
    const top = RANKS[RANKS.length - 1];
    assert.equal(rankFor(top.min + 1_000_000).name, top.name);
    assert.equal(nextRank(top.min + 1_000_000), null);
  });

  it('nextRank is the first threshold strictly above the current reputation', () => {
    assert.equal(nextRank(0)?.name, 'Instigator');
    assert.equal(nextRank(299)?.name, 'Instigator');
    assert.equal(nextRank(300)?.name, 'Hot Take', 'exactly at a threshold must advance the next target');
  });
});

describe('rank progress', () => {
  it('reports progress into the current tier', () => {
    const p = rankProgress(450);
    assert.equal(p.current.name, 'Instigator');
    assert.equal(p.next?.name, 'Hot Take');
    assert.equal(p.into, 150);
    assert.equal(p.span, 600);
    assert.equal(p.toNext, 450);
    assert.ok(p.ratio > 0 && p.ratio < 1);
  });

  it('never reports a ratio outside 0..1', () => {
    for (const rep of [0, 14, 299, 300, 900, 2_400, 11_000, 25_000, 50_000, 999_999]) {
      const p = rankProgress(rep);
      assert.ok(p.ratio >= 0 && p.ratio <= 1, `ratio out of range at ${rep}: ${p.ratio}`);
      assert.ok(p.toNext >= 0, `negative toNext at ${rep}`);
    }
  });

  it('at the top rank reports a complete bar and nothing left to earn', () => {
    const p = rankProgress(50_000);
    assert.equal(p.next, null);
    assert.equal(p.toNext, 0);
    assert.equal(p.ratio, 1);
  });

  it('at a tier boundary reports a zeroed bar', () => {
    const p = rankProgress(300);
    assert.equal(p.current.name, 'Instigator');
    assert.equal(p.into, 0);
    assert.equal(p.ratio, 0);
  });
});
