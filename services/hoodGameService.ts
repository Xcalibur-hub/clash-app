/**
 * Hood Prediction Games API. Screens never talk to PostgREST for entries or
 * resolution — every write is an RPC, and aggregates come only from
 * `hood_game_view` so anti-bandwagon rules cannot drift into the client.
 *
 * No coins, reputation, leaderboards or betting language.
 */

import type { HoodId } from '../store/types';
import type { DbHood, Json } from '../supabase/types';
import { requestError, requireSupabase, SupabaseError } from './supabaseClient';

export type HoodGameStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'RESOLVED' | 'CANCELLED';
export type HoodGameType = 'PREDICTION';

export interface HoodGameOptionView {
  id: string;
  label: string;
  position: number;
  /** Null until the game is CLOSED/RESOLVED (anti-bandwagon). */
  count: number | null;
  /** Null until the game is CLOSED/RESOLVED. */
  percent: number | null;
  /** Null until RESOLVED. */
  isWinner: boolean | null;
}

export interface HoodGameView {
  id: string;
  hood: Exclude<HoodId, 'for-you'>;
  type: HoodGameType;
  question: string;
  status: HoodGameStatus;
  opensAt: number;
  closesAt: number;
  resolvedAt: number | null;
  winningOptionId: string | null;
  options: readonly HoodGameOptionView[];
  viewerOptionId: string | null;
  hasPredicted: boolean;
  mayPredict: boolean;
  mayResolve: boolean;
  /** Null before the viewer predicts and before close. */
  totalParticipants: number | null;
  correctCount: number | null;
  correctPercent: number | null;
  viewerCorrect: boolean | null;
}

function asMillis(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toOption(value: unknown): HoodGameOptionView | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as { [key: string]: unknown };
  if (typeof r.id !== 'string' || typeof r.label !== 'string' || typeof r.position !== 'number') return null;
  return {
    id: r.id,
    label: r.label,
    position: r.position,
    count: asNullableNumber(r.count),
    percent: asNullableNumber(r.percent),
    isWinner: typeof r.isWinner === 'boolean' ? r.isWinner : null,
  };
}

function toGameView(payload: Json | null): HoodGameView {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SupabaseError('hood_game_view returned an unexpected payload', 'bad_payload');
  }
  const r = payload as { [key: string]: Json | undefined };
  const opensAt = asMillis(r.opensAt);
  const closesAt = asMillis(r.closesAt);
  const resolvedAt = r.resolvedAt === null ? null : asMillis(r.resolvedAt);
  const optionsRaw = r.options;
  if (
    typeof r.id !== 'string' ||
    typeof r.hood !== 'string' ||
    r.type !== 'PREDICTION' ||
    typeof r.question !== 'string' ||
    (r.status !== 'DRAFT' && r.status !== 'OPEN' && r.status !== 'CLOSED' && r.status !== 'RESOLVED' && r.status !== 'CANCELLED') ||
    opensAt === null ||
    closesAt === null ||
    !Array.isArray(optionsRaw) ||
    typeof r.hasPredicted !== 'boolean' ||
    typeof r.mayPredict !== 'boolean' ||
    typeof r.mayResolve !== 'boolean'
  ) {
    throw new SupabaseError('hood_game_view returned an unexpected payload', 'bad_payload');
  }
  const options = optionsRaw.map(toOption).filter((o): o is HoodGameOptionView => o !== null);
  return {
    id: r.id,
    hood: r.hood as Exclude<HoodId, 'for-you'>,
    type: 'PREDICTION',
    question: r.question,
    status: r.status,
    opensAt,
    closesAt,
    resolvedAt,
    winningOptionId: typeof r.winningOptionId === 'string' ? r.winningOptionId : null,
    options,
    viewerOptionId: typeof r.viewerOptionId === 'string' ? r.viewerOptionId : null,
    hasPredicted: r.hasPredicted,
    mayPredict: r.mayPredict,
    mayResolve: r.mayResolve,
    totalParticipants: asNullableNumber(r.totalParticipants),
    correctCount: asNullableNumber(r.correctCount),
    correctPercent: asNullableNumber(r.correctPercent),
    viewerCorrect: typeof r.viewerCorrect === 'boolean' ? r.viewerCorrect : null,
  };
}

/** True when the signed-in viewer moderates this Hood (existing moderator model). */
export async function viewerModeratesHood(hood: Exclude<HoodId, 'for-you'>): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc('is_hood_moderator', { p_hood: hood as DbHood });
  if (error) throw requestError(error);
  return data === true;
}

export async function fetchHoodGameView(gameId: string): Promise<HoodGameView | null> {
  const { data, error } = await requireSupabase().rpc('hood_game_view', { p_game_id: gameId });
  if (error) throw requestError(error);
  if (data === null) return null;
  return toGameView(data);
}

/** The PLAY shelf game for a Hood, or null when none is active. */
export async function fetchActivePrediction(hood: Exclude<HoodId, 'for-you'>): Promise<HoodGameView | null> {
  const { data, error } = await requireSupabase().rpc('hood_active_prediction', { p_hood: hood as DbHood });
  if (error) throw requestError(error);
  if (data === null) return null;
  return toGameView(data);
}

export async function createPredictionGame(
  hood: Exclude<HoodId, 'for-you'>,
  question: string,
  options: readonly string[],
  closesAt: Date,
): Promise<string> {
  const { data, error } = await requireSupabase().rpc('create_prediction_game', {
    p_hood: hood as DbHood,
    p_question: question,
    p_options: [...options],
    p_closes_at: closesAt.toISOString(),
  });
  if (error) throw requestError(error);
  if (typeof data !== 'string') throw new SupabaseError('create_prediction_game returned no id', 'bad_payload');
  return data;
}

export async function submitPrediction(gameId: string, optionId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('submit_prediction', {
    p_game_id: gameId,
    p_option_id: optionId,
  });
  if (error) throw requestError(error);
}

export async function resolvePredictionGame(gameId: string, winningOptionId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('resolve_prediction_game', {
    p_game_id: gameId,
    p_winning_option_id: winningOptionId,
  });
  if (error) throw requestError(error);
}
