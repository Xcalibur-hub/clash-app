/**
 * Profile reads/writes for the social identity surface. All data is real
 * (Supabase); the client never calls the backend directly from UI.
 */

import { toComment, toTake, toUser, PUBLIC_PROFILE_FIELDS } from './arenaMappers';
import type { ServerVerdict } from './clashEngineService';
import { requestError, requireSupabase } from './supabaseClient';
import type { ChallengerComment, HoodId, Take, User } from '../store/types';

/** The profile's result in a settled Clash. */
export type ClashOutcome = 'won' | 'lost' | 'draw';

/** A Clash from the profile's perspective (author or challenger). */
export interface ProfileClash {
  clash: {
    id: string;
    takeId: string;
    status: 'open' | 'settled' | 'cancelled';
    createdAt: number;
    closesAt: number;
  };
  verdict: ServerVerdict | null;
  takeText: string;
  /** Null when the viewer is not allowed to see the counterpart (open Blind Clash). */
  opponentId: string | null;
  /** Result from the profile's side; null when no verdict. A tie is 'draw', never 'lost'. */
  outcome: ClashOutcome | null;
}

export interface ProfileReply {
  comment: ChallengerComment;
  take: Take | null;
}

export interface ProfilePatch {
  name?: string;
  handle?: string;
  bio?: string;
  homeHood?: Exclude<HoodId, 'for-you'>;
}

export async function fetchProfileById(profileId: string): Promise<User | null> {
  const { data, error } = await requireSupabase().from('profiles').select(PUBLIC_PROFILE_FIELDS).eq('id', profileId).maybeSingle();
  if (error) throw requestError(error);
  return data ? toUser(data) : null;
}

export async function fetchProfileTakes(profileId: string): Promise<Take[]> {
  const { data, error } = await requireSupabase()
    .from('takes')
    .select('*')
    .eq('author_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw requestError(error);
  return (data ?? []).map(toTake);
}

export async function fetchProfileReplies(profileId: string): Promise<ProfileReply[]> {
  const client = requireSupabase();
  const commentsRes = await client
    .from('comments')
    .select('*')
    .eq('author_id', profileId)
    .eq('is_removed', false)
    .order('created_at', { ascending: false })
    .limit(50);
  if (commentsRes.error) throw requestError(commentsRes.error);
  const comments = (commentsRes.data ?? []).map(toComment);
  const takeIds = [...new Set(comments.map((comment) => comment.takeId))];
  const takesRes = takeIds.length > 0 ? await client.from('takes').select('*').in('id', takeIds) : { data: [], error: null };
  if (takesRes.error) throw requestError(takesRes.error);
  const takes = new Map((takesRes.data ?? []).map((row) => [row.id, toTake(row)]));
  return comments.map((comment) => ({ comment, take: takes.get(comment.takeId) ?? null }));
}

/** Clashes the profile took part in (as Take author or challenger), newest first. */
export async function fetchProfileClashes(profileId: string): Promise<ProfileClash[]> {
  const { data, error } = await requireSupabase().rpc('profile_clash_list', { p_profile_id: profileId });
  if (error) throw requestError(error);
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const record = entry as { [key: string]: unknown };
    const clashId = record.clashId;
    const takeId = record.takeId;
    const status = record.status;
    const createdAt = typeof record.createdAt === 'string' ? Date.parse(record.createdAt) : NaN;
    const closesAt = typeof record.closesAt === 'string' ? Date.parse(record.closesAt) : NaN;
    const takeText = record.takeText;
    const opponentId = record.opponentId;
    const outcome = record.outcome;
    if (
      typeof clashId !== 'string' ||
      typeof takeId !== 'string' ||
      (status !== 'open' && status !== 'settled' && status !== 'cancelled') ||
      Number.isNaN(createdAt) ||
      Number.isNaN(closesAt) ||
      typeof takeText !== 'string' ||
      (opponentId !== null && typeof opponentId !== 'string') ||
      (outcome !== null && outcome !== 'won' && outcome !== 'lost' && outcome !== 'draw')
    ) {
      return [];
    }
    const verdictRaw = record.verdict;
    let verdict: ServerVerdict | null = null;
    if (verdictRaw !== null && typeof verdictRaw === 'object' && !Array.isArray(verdictRaw)) {
      const v = verdictRaw as { [key: string]: unknown };
      if (
        typeof v.clashId === 'string' &&
        (v.winnerSide === 'A' || v.winnerSide === 'B' || v.winnerSide === 'DRAW') &&
        typeof v.sideAScore === 'number' &&
        typeof v.sideBScore === 'number' &&
        typeof v.jurySize === 'number' &&
        typeof v.agreement === 'number' &&
        typeof v.margin === 'number' &&
        typeof v.verdictLabel === 'string'
      ) {
        verdict = {
          clashId: v.clashId,
          winnerSide: v.winnerSide,
          sideAScore: v.sideAScore,
          sideBScore: v.sideBScore,
          jurySize: v.jurySize,
          agreement: v.agreement,
          margin: v.margin,
          verdictLabel: v.verdictLabel,
        };
      }
    }
    return [{
      clash: { id: clashId, takeId, status, createdAt, closesAt },
      verdict,
      takeText,
      opponentId,
      outcome,
    }];
  });
}

/** Update the editable profile fields (RLS/column-granted). */
export async function updateProfile(profileId: string, patch: ProfilePatch): Promise<void> {
  const { error } = await requireSupabase()
    .from('profiles')
    .update({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.handle !== undefined ? { handle: patch.handle } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.homeHood !== undefined ? { home_hood: patch.homeHood } : {}),
    })
    .eq('id', profileId);
  if (error) throw requestError(error);
}
