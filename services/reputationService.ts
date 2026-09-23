import type { Alignment, RankName, XpEvent } from '../store/types';
import { rankFor, rankProgress, XP } from '../utils/reputation';

/**
 * Reputation & coin awards (spec §11).
 *
 * Every award is expressed as a **ledger** — the result screen shows the exact
 * lines that produced the number, so reputation never feels like a random score.
 * Coins are status points only; there is deliberately no cash-out path.
 */

/** Coins stay a separate, smaller gradient so reputation is the real prestige. */
const COINS: Record<Alignment, number> = { majority: 40, minority: 18, abstained: 8 };

export interface Award {
  reputation: number;
  coins: number;
  events: readonly XpEvent[];
  rankBefore: RankName;
  rankAfter: RankName;
  /** Flavour title of the new rank, shown as "YOUR RANK" (spec §10). */
  rankTitle: string;
  rankedUp: boolean;
  /** 0..1 progress inside the tier, before and after the award. */
  progressBefore: number;
  progressAfter: number;
  nextRankName: RankName | null;
  toNextRank: number;
  description: string;
}

/**
 * §11 ledger. Judging always pays the participation rate; calling the clash
 * correctly adds the win bonus on top (15 + 105 = the documented +120 for a won
 * clash). A dissenting ballot earns a small credit so judging is never wasted.
 */
function ledgerFor(alignment: Alignment): XpEvent[] {
  const events: XpEvent[] = [
    { id: 'participate', label: 'Judged the clash', delta: XP.participate },
  ];
  if (alignment === 'majority') {
    events.push({ id: 'win', label: 'Called it with the jury', delta: XP.winBonus });
  } else if (alignment === 'minority') {
    events.push({ id: 'dissent', label: 'Dissent recorded', delta: XP.dissent });
  }
  return events;
}

export function awardDescription(alignment: Alignment): string {
  if (alignment === 'majority') return 'Your judgement matched the jury';
  if (alignment === 'minority') return 'You backed the losing side — dissent logged';
  return 'You abstained, so the jury decided';
}

export function awardForJudgement(alignment: Alignment, viewerReputation: number): Award {
  const events = ledgerFor(alignment);
  const reputation = events.reduce((total, event) => total + event.delta, 0);
  const after = viewerReputation + reputation;
  const before = rankProgress(viewerReputation);
  const next = rankProgress(after);
  const rankBefore = rankFor(viewerReputation);

  return {
    reputation,
    coins: COINS[alignment],
    events,
    rankBefore: rankBefore.name,
    rankAfter: next.current.name,
    rankTitle: next.current.title,
    rankedUp: rankBefore.name !== next.current.name,
    progressBefore: before.ratio,
    progressAfter: next.ratio,
    nextRankName: next.next?.name ?? null,
    toNextRank: next.toNext,
    description: awardDescription(alignment),
  };
}
