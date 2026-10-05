/**
 * Arena trending battles API — server snapshots only.
 */
import type { ArenaTrendMomentum } from '../utils/arenaTrendScore';
import { requireSupabase, requestError } from './supabaseClient';

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
  momentum: ArenaTrendMomentum;
  changePercent: number | null;
  topicStatus: string;
  participantCount: number;
  activeRoomCount: number;
  hotRoomId: string | null;
  series: ArenaTrendPoint[];
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
    momentum: toMomentum(record.momentum),
    changePercent: num(record.changePercent),
    topicStatus: str(record.topicStatus) ?? 'live',
    participantCount: num(record.participantCount) ?? 0,
    activeRoomCount: num(record.activeRoomCount) ?? 0,
    hotRoomId: str(record.hotRoomId),
    series,
  };
}

/** Cheap Top-10 + graph history. Never invents battles when empty. */
export async function fetchTrendingBattles(limit = 10): Promise<ArenaTrendingBattle[]> {
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
