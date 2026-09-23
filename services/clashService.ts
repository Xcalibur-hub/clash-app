import type { Clash, ClashResult, Judgement } from '../store/types';
import { awardForJudgement } from './reputationService';
import { submitJudgement } from './juryService';

/**
 * Clash settlement. The screen asks for a result, the store records it, and no
 * UI component needs to know how the jury or the economy works.
 *
 * Order matters: the jury settles the clash first, then the economy pays out
 * against the viewer's alignment — which is why a result carries both the
 * verdict and the reputation ledger (spec §9 → §10 → §11).
 */

export interface ResolveClashInput {
  clash: Clash;
  judgement: Judgement;
  viewerReputation: number;
}

export function resolveClash({
  clash,
  judgement,
  viewerReputation,
}: ResolveClashInput): ClashResult {
  const verdict = submitJudgement(clash.jurors, judgement);
  const award = awardForJudgement(verdict.alignment, viewerReputation);
  return {
    clashId: clash.id,
    winningSide: verdict.winningSide,
    score: verdict.score,
    verdict: verdict.verdict,
    alignment: verdict.alignment,
    reputation: award.reputation,
    coins: award.coins,
    events: award.events,
    rankBefore: award.rankBefore,
    rankAfter: award.rankAfter,
    rankTitle: award.rankTitle,
    progressBefore: award.progressBefore,
    progressAfter: award.progressAfter,
    nextRankName: award.nextRankName,
    toNextRank: award.toNextRank,
    resolvedAt: Date.now(),
  };
}

/** Score line used by the reveal: "6 — 3". */
export function scoreLine(result: Pick<ClashResult, 'score'>): string {
  return `${result.score.a} — ${result.score.b}`;
}
