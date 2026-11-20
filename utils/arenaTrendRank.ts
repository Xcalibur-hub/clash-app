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

/**
 * How much of the ranking race can honestly be drawn yet.
 *
 *   EMPTY        no ranked topics at all
 *   LIVE_MARKERS current ranks only — history is still building, so no line
 *   FIRST_POINT  one bucket: a marker per topic, still no line
 *   FIRST_LINES  two buckets: the first real segments exist
 *   RACE         three or more buckets: the race proper
 */
export type TrendRaceStage = 'EMPTY' | 'LIVE_MARKERS' | 'FIRST_POINT' | 'FIRST_LINES' | 'RACE';

export function trendRaceStage(input: {
  topicCount: number;
  pointCounts: readonly number[];
}): TrendRaceStage {
  if (input.topicCount <= 0) return 'EMPTY';
  const maxPoints = input.pointCounts.reduce((best, next) => (next > best ? next : best), 0);
  if (maxPoints <= 0) return 'LIVE_MARKERS';
  if (maxPoints === 1) return 'FIRST_POINT';
  if (maxPoints === 2) return 'FIRST_LINES';
  return 'RACE';
}

/** True when at least one historical point exists but no line can be drawn yet. */
export function isEarlyHistory(stage: TrendRaceStage): boolean {
  return stage === 'LIVE_MARKERS' || stage === 'FIRST_POINT';
}

export interface TrendRaceCaption {
  /** Replaces the "rank / hh:mm" meta row while history is thin. */
  kicker: string;
  note: string;
}

/**
 * Early-history copy. It says exactly what is on screen: a live ranking with a
 * trend line that has not started yet.
 */
export function trendRaceCaption(stage: TrendRaceStage): TrendRaceCaption | null {
  if (stage === 'EMPTY') return null;
  if (stage === 'LIVE_MARKERS') {
    return { kicker: 'LIVE RANKING', note: 'Building today’s trend history…' };
  }
  if (stage === 'FIRST_POINT') {
    return { kicker: 'LIVE RANKING', note: 'First snapshot in — the line starts soon.' };
  }
  return null;
}

/** Does any topic actually overtake another inside the window? */
export function raceHasCrossings(seriesList: readonly (readonly RankPoint[])[]): boolean {
  const ordered = seriesList
    .map((points) => [...points].sort((a, b) => a.t - b.t))
    .filter((points) => points.length >= 2);
  if (ordered.length < 2) return false;

  const buckets = new Set<number>();
  for (const points of ordered) for (const point of points) buckets.add(point.t);
  const timeline = [...buckets].sort((a, b) => a - b);
  if (timeline.length < 2) return false;

  const rankAt = (points: readonly RankPoint[], t: number): number | null => {
    const hit = points.find((point) => point.t === t);
    return hit ? hit.v : null;
  };

  // Relative order between two topics flipping across buckets means a crossing.
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      let previous: number | null = null;
      for (const bucket of timeline) {
        const a = rankAt(ordered[i], bucket);
        const b = rankAt(ordered[j], bucket);
        if (a == null || b == null) continue;
        const sign = a < b ? -1 : a > b ? 1 : 0;
        if (sign !== 0) {
          if (previous != null && sign !== previous) return true;
          previous = sign;
        }
      }
    }
  }
  return false;
}

export type { ArenaTrendMomentum };
