/**
 * Server-authoritative Clash engine. The client only requests actions and reads
 * results — it never computes a jury, a winner, totals, settlement timing, or
 * any reputation/coin/rank/streak/wins change.
 */

import { currentViewerProfileId } from './apiService';
import { requestError, requireSupabase, SupabaseError } from './supabaseClient';
import type { ClashRow, ClashSide, ClashStatus, Json, VerdictWinner } from '../supabase/types';

export type ClashMode = 'STANDARD' | 'BLIND';

export interface ServerVerdict {
  clashId: string;
  /** 'A', 'B', or 'DRAW' — a tie is never awarded to a side. */
  winnerSide: VerdictWinner;
  sideAScore: number;
  sideBScore: number;
  jurySize: number;
  agreement: number;
  margin: number;
  verdictLabel: string;
}

export interface ReputationEvent {
  id: string;
  profileId: string;
  clashId: string | null;
  kind: string;
  reputationDelta: number;
  coinsDelta: number;
  createdAt: number;
}

/** Start a Clash as the signed-in challenger; returns the server clash id. */
export async function startClash(
  takeId: string,
  commentId?: string,
  mode: ClashMode = 'STANDARD',
): Promise<string> {
  const { data, error } = await requireSupabase().rpc('start_clash', {
    p_take_id: takeId,
    p_comment_id: commentId,
    p_mode: mode,
  });
  if (error) throw requestError(error);
  return data;
}

/** Cast one ballot. */
export async function submitJudgement(clashId: string, side: ClashSide): Promise<void> {
  const { error } = await requireSupabase().rpc('submit_judgement', {
    p_clash_id: clashId,
    p_side: side,
  });
  if (error) throw requestError(error);
}

function toVerdict(payload: Json | null): ServerVerdict {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const r = payload as { [key: string]: Json | undefined };
    const clashId = r.clash_id;
    const winnerSide = r.winner_side;
    const sideAScore = r.side_a_score;
    const sideBScore = r.side_b_score;
    const jurySize = r.jury_size;
    const agreement = r.agreement;
    const margin = r.margin;
    const verdictLabel = r.verdict_label;
    if (
      typeof clashId === 'string' &&
      (winnerSide === 'A' || winnerSide === 'B' || winnerSide === 'DRAW') &&
      typeof sideAScore === 'number' &&
      typeof sideBScore === 'number' &&
      typeof jurySize === 'number' &&
      typeof agreement === 'number' &&
      typeof margin === 'number' &&
      typeof verdictLabel === 'string'
    ) {
      return { clashId, winnerSide, sideAScore, sideBScore, jurySize, agreement, margin, verdictLabel };
    }
  }
  throw new SupabaseError('settle_clash returned an unexpected payload', 'bad_payload');
}

/** Settle a closed clash (idempotent); returns the single verdict. */
export async function settleClash(clashId: string): Promise<ServerVerdict> {
  const { data, error } = await requireSupabase().rpc('settle_clash', { p_clash_id: clashId });
  if (error) throw requestError(error);
  return toVerdict(data);
}

/** The settled verdict, or null while the clash is still open. */
export async function fetchVerdict(clashId: string): Promise<ServerVerdict | null> {
  const { data, error } = await requireSupabase()
    .from('verdicts')
    .select('*')
    .eq('clash_id', clashId)
    .maybeSingle();
  if (error) throw requestError(error);
  if (!data) return null;
  return {
    clashId: data.clash_id,
    winnerSide: data.winner_side,
    sideAScore: data.side_a_score,
    sideBScore: data.side_b_score,
    jurySize: data.jury_size,
    agreement: data.agreement,
    margin: data.margin,
    verdictLabel: data.verdict_label,
  };
}

/** The signed-in user's own ballot for a clash, or null. */
export async function fetchMyBallot(clashId: string): Promise<ClashSide | null> {
  const me = await currentViewerProfileId();
  if (!me) return null;
  const { data, error } = await requireSupabase()
    .from('judgements')
    .select('side')
    .eq('clash_id', clashId)
    .eq('juror_id', me)
    .maybeSingle();
  if (error) throw requestError(error);
  return data?.side ?? null;
}

/** A Clash row resolved to domain shape (server-authoritative, no client inference). */
export interface ClashDetail {
  id: string;
  takeId: string;
  /** Omitted on API-role table reads; identities come from `clash_view`. */
  challengerId: string;
  challengerCommentId: string | null;
  status: ClashStatus;
  mode: ClashMode;
  opensAt: number;
  closesAt: number;
  createdAt: number;
  settledAt: number | null;
}

export interface ClashParticipant {
  id: string;
  name: string;
  handle: string;
  tint: string;
}

/** Authoritative Clash screen payload — identities only when the server says revealed. */
export interface ClashView {
  clashId: string;
  takeId: string;
  mode: ClashMode;
  status: ClashStatus;
  revealed: boolean;
  isParticipant: boolean;
  mayJudge: boolean;
  hasJudged: boolean;
  myBallot: ClashSide | null;
  opensAt: number;
  closesAt: number;
  settledAt: number | null;
  sideAText: string;
  sideBText: string;
  sideA: ClashParticipant | null;
  sideB: ClashParticipant | null;
  /** Optional Side B media from the challenger comment (image/video URL). */
  sideBMediaKind: 'image' | 'video' | null;
  sideBMediaUrl: string | null;
  verdict: ServerVerdict | null;
}

function asMillis(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function toParticipant(value: Json | null | undefined): ClashParticipant | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as { [key: string]: Json | undefined };
  const { id, name, handle, tint } = record;
  if (typeof id === 'string' && typeof name === 'string' && typeof handle === 'string' && typeof tint === 'string') {
    return { id, name, handle, tint };
  }
  return null;
}

function toViewVerdict(value: Json | null | undefined): ServerVerdict | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const mapped = toVerdict(value);
    return mapped;
  } catch {
    const record = value as { [key: string]: Json | undefined };
    const clashId = record.clashId;
    const winnerSide = record.winnerSide;
    const agreement = typeof record.agreement === 'number' ? record.agreement : Number(record.agreement);
    const margin = typeof record.margin === 'number' ? record.margin : Number(record.margin);
    const sideAScore = typeof record.sideAScore === 'number' ? record.sideAScore : Number(record.sideAScore);
    const sideBScore = typeof record.sideBScore === 'number' ? record.sideBScore : Number(record.sideBScore);
    const jurySize = typeof record.jurySize === 'number' ? record.jurySize : Number(record.jurySize);
    const verdictLabel = record.verdictLabel;
    if (
      typeof clashId === 'string' &&
      (winnerSide === 'A' || winnerSide === 'B' || winnerSide === 'DRAW') &&
      Number.isFinite(sideAScore) &&
      Number.isFinite(sideBScore) &&
      Number.isFinite(jurySize) &&
      Number.isFinite(agreement) &&
      Number.isFinite(margin) &&
      typeof verdictLabel === 'string'
    ) {
      return { clashId, winnerSide, sideAScore, sideBScore, jurySize, agreement, margin, verdictLabel };
    }
    return null;
  }
}

function toClashView(payload: Json | null): ClashView {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SupabaseError('clash_view returned an unexpected payload', 'bad_payload');
  }
  const r = payload as { [key: string]: Json | undefined };
  const clashId = r.clashId;
  const takeId = r.takeId;
  const mode = r.mode;
  const status = r.status;
  const revealed = r.revealed;
  const isParticipant = r.isParticipant;
  const mayJudge = r.mayJudge;
  const hasJudged = r.hasJudged;
  const myBallot = r.myBallot;
  const opensAt = asMillis(r.opensAt);
  const closesAt = asMillis(r.closesAt);
  const settledAt = r.settledAt === null ? null : asMillis(r.settledAt);
  const sideAText = r.sideAText;
  const sideBText = r.sideBText;
  if (
    typeof clashId !== 'string' ||
    typeof takeId !== 'string' ||
    (mode !== 'STANDARD' && mode !== 'BLIND') ||
    (status !== 'open' && status !== 'settled' && status !== 'cancelled') ||
    typeof revealed !== 'boolean' ||
    typeof isParticipant !== 'boolean' ||
    typeof mayJudge !== 'boolean' ||
    typeof hasJudged !== 'boolean' ||
    (myBallot !== null && myBallot !== 'A' && myBallot !== 'B') ||
    opensAt === null ||
    closesAt === null ||
    typeof sideAText !== 'string' ||
    typeof sideBText !== 'string'
  ) {
    throw new SupabaseError('clash_view returned an unexpected payload', 'bad_payload');
  }
  return {
    clashId,
    takeId,
    mode,
    status,
    revealed,
    isParticipant,
    mayJudge,
    hasJudged,
    myBallot,
    opensAt,
    closesAt,
    settledAt,
    sideAText,
    sideBText,
    sideA: toParticipant(r.sideA),
    sideB: toParticipant(r.sideB),
    sideBMediaKind:
      r.sideBMediaKind === 'image' || r.sideBMediaKind === 'video' ? r.sideBMediaKind : null,
    sideBMediaUrl: typeof r.sideBMediaUrl === 'string' ? r.sideBMediaUrl : null,
    verdict: toViewVerdict(r.verdict),
  };
}

function toClashDetail(row: ClashRow): ClashDetail {
  return {
    id: row.id,
    takeId: row.take_id,
    challengerId: row.challenger_id ?? '',
    challengerCommentId: row.challenger_comment_id ?? null,
    status: row.status,
    mode: (row as ClashRow & { mode?: ClashMode }).mode ?? 'STANDARD',
    opensAt: Date.parse(row.opens_at),
    closesAt: Date.parse(row.closes_at),
    createdAt: Date.parse(row.created_at),
    settledAt: row.settled_at ? Date.parse(row.settled_at) : null,
  };
}

/** The relevant current Clash for a Take: the active open one, else the latest. */
export async function fetchClashForTake(takeId: string): Promise<ClashDetail | null> {
  const client = requireSupabase();
  const open = await client
    .from('clashes')
    .select('*')
    .eq('take_id', takeId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open.error) throw requestError(open.error);
  if (open.data) return toClashDetail(open.data);

  const latest = await client
    .from('clashes')
    .select('*')
    .eq('take_id', takeId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw requestError(latest.error);
  return latest.data ? toClashDetail(latest.data) : null;
}

/** Fetch a single Clash by id (safe columns only — identities live in `clash_view`). */
export async function fetchClashById(clashId: string): Promise<ClashDetail | null> {
  const { data, error } = await requireSupabase()
    .from('clashes')
    .select('id, take_id, status, mode, opens_at, closes_at, created_at, settled_at')
    .eq('id', clashId)
    .maybeSingle();
  if (error) throw requestError(error);
  return data ? toClashDetail({ ...data, challenger_id: '', challenger_comment_id: null } as ClashRow) : null;
}

/** Authoritative Clash screen read. Identities are present only when revealed. */
export async function fetchClashViewForTake(takeId: string): Promise<ClashView | null> {
  const { data, error } = await requireSupabase().rpc('clash_view_for_take', { p_take_id: takeId });
  if (error) throw requestError(error);
  if (data === null) return null;
  return toClashView(data);
}

/** A profile's public reward ledger. */
export async function fetchReputationEvents(profileId: string): Promise<ReputationEvent[]> {
  const { data, error } = await requireSupabase()
    .from('reputation_events')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw requestError(error);
  return data.map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    clashId: row.clash_id,
    kind: row.kind,
    reputationDelta: row.reputation_delta,
    coinsDelta: row.coins_delta,
    createdAt: Date.parse(row.created_at),
  }));
}
