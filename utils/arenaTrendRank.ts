/**
 * Ranking-race helpers for Arena Trending Now.
 * Historical ranks + recency weights — pure functions of snapshot data.
 */

import type { ArenaTrendMomentum } from './arenaTrendScore';

export type RankDeltaKind = 'UP' | 'DOWN' | 'FLAT' | 'NEW' | 'INSUFFICIENT';

export interface TrendSnapshotPoint {
  topicId: string;
  bucketAt: number;
  attentionScore: number;
  uniqueActors: number;
}

export interface RankPoint {
  t: number;
  /** Rank at this timestamp (1 = most popular). */
  v: number;
}

/** Recency weight — mirrors `arena_trend_recency_weight` SQL. */
export function arenaTrendRecencyWeight(ageMinutes: number): number {
  if (!Number.isFinite(ageMinutes) || ageMinutes < 0) return 0;
  if (ageMinutes <= 30) return 1;
  if (ageMinutes <= 60) return 0.65;
  if (ageMinutes <= 180) return 0.3;
  if (ageMinutes <= 360) return 0.1;
  return 0;
}

/** Recency-weighted popularity from snapshot history. */
export function recencyWeightedScore(
  snapshots: readonly { attentionScore: number; ageMinutes: number }[],
): number {
  let sum = 0;
  for (const snap of snapshots) {
    if (snap.attentionScore <= 0) continue;
    sum += snap.attentionScore * arenaTrendRecencyWeight(snap.ageMinutes);
  }
  return sum;
}

/** Rank topics at a single bucket by attention (deterministic ties). */
export function rankTopicsAtBucket(
  rows: readonly { topicId: string; attentionScore: number; uniqueActors: number }[],
): Map<string, number> {
  const sorted = [...rows]
    .filter((r) => r.attentionScore > 0)
    .sort((a, b) => {
      if (b.attentionScore !== a.attentionScore) return b.attentionScore - a.attentionScore;
      if (b.uniqueActors !== a.uniqueActors) return b.uniqueActors - a.uniqueActors;
      return a.topicId.localeCompare(b.topicId);
    });
  const ranks = new Map<string, number>();
  sorted.forEach((row, i) => ranks.set(row.topicId, i + 1));
  return ranks;
}

/**
 * Build historical rank series for a set of topic ids across buckets.
 * Only emits points when the topic had a snapshot at that bucket.
 */
export function buildHistoricalRankSeries(
  snapshots: readonly TrendSnapshotPoint[],
  topicIds: readonly string[],
): Map<string, RankPoint[]> {
  const byBucket = new Map<number, TrendSnapshotPoint[]>();
  for (const snap of snapshots) {
    if (snap.attentionScore <= 0) continue;
    const list = byBucket.get(snap.bucketAt) ?? [];
    list.push(snap);
    byBucket.set(snap.bucketAt, list);
  }

  const buckets = [...byBucket.keys()].sort((a, b) => a - b);
  const out = new Map<string, RankPoint[]>();
  for (const id of topicIds) out.set(id, []);

  for (const bucketAt of buckets) {
    const ranks = rankTopicsAtBucket(byBucket.get(bucketAt) ?? []);
    for (const id of topicIds) {
      const rank = ranks.get(id);
      if (rank == null) continue;
      out.get(id)!.push({ t: bucketAt, v: rank });
    }
  }
  return out;
}

/**
 * Places gained: oldRank - newRank.
 * Positive = rose. null when comparison unavailable.
 */
export function rankDeltaPlaces(
  currentRank: number,
  rankOneHourAgo: number | null,
): number | null {
  if (rankOneHourAgo == null || currentRank < 1) return null;
  return rankOneHourAgo - currentRank;
}

export function rankDeltaKind(
  currentRank: number,
  rankOneHourAgo: number | null,
  historyPoints: number,
): RankDeltaKind {
  if (rankOneHourAgo == null) {
    return historyPoints >= 1 ? 'NEW' : 'INSUFFICIENT';
  }
  if (rankOneHourAgo === currentRank) return 'FLAT';
  if (rankOneHourAgo > currentRank) return 'UP';
  return 'DOWN';
}

export function formatRankDelta(kind: RankDeltaKind, delta: number | null): string {
  if (kind === 'NEW') return 'NEW';
  if (kind === 'INSUFFICIENT' || kind === 'FLAT' || delta == null || delta === 0) return '—';
  if (delta > 0) return `↑${delta}`;
  return `↓${Math.abs(delta)}`;
}

export function shortTitle(title: string, max = 22): string {
  const clean = title.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export type { ArenaTrendMomentum };
