/**
 * Arena trending battles API — live ranking race from server snapshots.
 */
import Constants from 'expo-constants';
import type { ArenaTrendMomentum } from '../utils/arenaTrendScore';
import type { RankDeltaKind } from '../utils/arenaTrendRank';
import {
  arenaTrendDemoActive,
  arenaTrendDemoBattles,
  isArenaTrendDemoVariant,
} from '../utils/arenaTrendDevFixture';
import { requireSupabase, requestError } from './supabaseClient';

/** series.v is historical RANK (1 = top), not attention. */
export interface ArenaTrendPoint {
  t: number;
  v: number;
}

export interface ArenaTrendingBattle {
  rank: number;
  topicId: string;
  title: string;
  hood: string | null;
  attentionScore: number;
  weightedScore: number;
  momentum: ArenaTrendMomentum;
  rankDelta: number | null;
  rankDeltaKind: RankDeltaKind;
  changePercent: number | null;
  topicStatus: string;
  participantCount: number;
  activeRoomCount: number;
  hotRoomId: string | null;
  series: ArenaTrendPoint[];
  historyReady: boolean;
}

function client() {
  return requireSupabase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toPoint(value: unknown): ArenaTrendPoint | null {
  const record = asRecord(value);
  if (!record) return null;
  const t = num(record.t);
  const v = num(record.v);
  if (t == null || v == null) return null;
  return { t, v };
}

function toMomentum(value: unknown): ArenaTrendMomentum {
  if (value === 'RISING' || value === 'COOLING' || value === 'STEADY') return value;
  return 'STEADY';
}

function toDeltaKind(value: unknown): RankDeltaKind {
  if (
    value === 'UP' ||
    value === 'DOWN' ||
    value === 'FLAT' ||
    value === 'NEW' ||
    value === 'INSUFFICIENT'
  ) {
    return value;
  }
  return 'INSUFFICIENT';
}

function toBattle(value: unknown): ArenaTrendingBattle | null {
  const record = asRecord(value);
  if (!record) return null;
  const topicId = str(record.topicId);
  const title = str(record.title);
  if (!topicId || !title) return null;
  const seriesRaw = Array.isArray(record.series) ? record.series : [];
  const series: ArenaTrendPoint[] = [];
  for (const point of seriesRaw) {
    const parsed = toPoint(point);
    if (parsed) series.push(parsed);
  }
  return {
    rank: num(record.rank) ?? 0,
    topicId,
    title,
    hood: str(record.hood),
    attentionScore: num(record.attentionScore) ?? 0,
    weightedScore: num(record.weightedScore) ?? num(record.attentionScore) ?? 0,
    momentum: toMomentum(record.momentum),
    rankDelta: num(record.rankDelta),
    rankDeltaKind: toDeltaKind(record.rankDeltaKind),
    changePercent: num(record.changePercent),
    topicStatus: str(record.topicStatus) ?? 'live',
    participantCount: num(record.participantCount) ?? 0,
    activeRoomCount: num(record.activeRoomCount) ?? 0,
    hotRoomId: str(record.hotRoomId),
    series,
    historyReady: record.historyReady === true || series.length >= 2,
  };
}

/**
 * Is the development-only preview active? Never true in a release bundle
 * (`__DEV__` gate). Enable with `EXPO_PUBLIC_ARENA_TREND_DEMO=1` or the
 * fixture toggle.
 */
export function trendingDemoActive(): boolean {
  const extra = Constants.expoConfig?.extra as { appVariant?: unknown } | undefined;
  const variant = isArenaTrendDemoVariant(extra?.appVariant) ? extra.appVariant : 'development';
  return arenaTrendDemoActive({
    dev: typeof __DEV__ !== 'undefined' && __DEV__ === true,
    variant,
    envFlag: process.env.EXPO_PUBLIC_ARENA_TREND_DEMO ?? null,
  });
}

/**
 * Cheap Top-10 ranking race + historical ranks. Empty when nothing to show.
 *
 * In development with the demo toggle on, this returns a deterministic fixture
 * instead of calling the RPC: no server read, no writes, no analytics, and no
 * effect on any real ranking.
 */
export async function fetchTrendingBattles(limit = 10, serverOnly = false): Promise<ArenaTrendingBattle[]> {
  // `__DEV__` first, so a production bundle can drop the fixture branch entirely.
  if (!serverOnly && __DEV__ === true && trendingDemoActive()) return arenaTrendDemoBattles();

  const { data, error } = await client().rpc('list_arena_trending_battles', {
    p_limit: Math.min(10, Math.max(1, limit)),
  });
  if (error) throw requestError(error);
  const rows = data as unknown;
  if (!Array.isArray(rows)) return [];
  const out: ArenaTrendingBattle[] = [];
  for (const row of rows) {
    const battle = toBattle(row);
    if (battle) out.push(battle);
  }
  return out.slice(0, 10);
}
