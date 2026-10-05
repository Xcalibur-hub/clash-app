/**
 * Arena trending attention — pure mirror of server formula.
 * Not truth, stance, or argument quality: unique-actor activity only.
 */

export type ArenaTrendMomentum = 'RISING' | 'STEADY' | 'COOLING';

export interface ArenaAttentionSignals {
  messageAuthors: number;
  reactionActors: number;
  evidenceAuthors: number;
  joinActors: number;
}

/** Caps match `arena_attention_score` SQL. */
export function arenaAttentionScore(signals: ArenaAttentionSignals): number {
  const authors = Math.min(Math.max(0, signals.messageAuthors), 40);
  const reactors = Math.min(Math.max(0, signals.reactionActors), 80);
  const evidence = Math.min(Math.max(0, signals.evidenceAuthors), 20);
  const joins = Math.min(Math.max(0, signals.joinActors), 40);
  return authors * 10 + reactors * 3 + evidence * 6 + joins * 5;
}

export function arenaTrendMomentum(
  recentScore: number,
  priorScore: number,
  sampleActors: number,
): ArenaTrendMomentum {
  if (sampleActors < 3) return 'STEADY';
  if (priorScore <= 0 && recentScore >= 8) return 'RISING';
  if (priorScore <= 0) return 'STEADY';
  if ((recentScore - priorScore) / Math.max(priorScore, 1) >= 0.25) return 'RISING';
  if ((priorScore - recentScore) / Math.max(priorScore, 1) >= 0.25) return 'COOLING';
  return 'STEADY';
}

/** Only emit % when sample is honest enough to avoid tiny-sample noise. */
export function arenaTrendChangePercent(
  recentScore: number,
  priorScore: number,
  sampleActors: number,
): number | null {
  if (sampleActors < 5 || priorScore < 8) return null;
  return Math.round(((recentScore - priorScore) / Math.max(priorScore, 1)) * 100);
}

export function momentumGlyph(momentum: ArenaTrendMomentum): string {
  if (momentum === 'RISING') return '↑';
  if (momentum === 'COOLING') return '↓';
  return '→';
}

export function momentumLabel(momentum: ArenaTrendMomentum): string {
  if (momentum === 'RISING') return 'Rising';
  if (momentum === 'COOLING') return 'Cooling';
  return 'Steady';
}

/** Stable Top-10 sort: score desc, actors desc, id asc. */
export function rankTrendTopics<T extends { attentionScore: number; uniqueActors: number; topicId: string }>(
  rows: readonly T[],
  limit = 10,
): T[] {
  return [...rows]
    .filter((r) => r.attentionScore > 0)
    .sort((a, b) => {
      if (b.attentionScore !== a.attentionScore) return b.attentionScore - a.attentionScore;
      if (b.uniqueActors !== a.uniqueActors) return b.uniqueActors - a.uniqueActors;
      return a.topicId.localeCompare(b.topicId);
    })
    .slice(0, Math.min(10, Math.max(0, limit)));
}
