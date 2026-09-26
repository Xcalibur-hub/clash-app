import { VIEWER_SEED } from '../data/mockUsers';
import type { ChallengerComment, HoodId, Take, User } from '../store/types';
import type { DbHood } from '../supabase/database.types';
import {
  toComment,
  toPostMedia,
  toTake,
  toUpvoteResult,
  toUser,
  type PostTakeMedia,
  type UpvoteResult,
} from './arenaMappers';
import { currentUserId, ensureSession, requestError, requireSupabase } from './supabaseClient';

export type { PostTakeMedia, UpvoteResult } from './arenaMappers';

/**
 * The Arena's data API: one function per query the app needs, each answering with
 * the domain types the store already uses (`store/types.ts`), so a screen swaps a
 * selector for a fetch without learning a second vocabulary. Rows never leak out —
 * `services/arenaMappers.ts` owns the snake_case → camelCase translation.
 *
 * Until auth ships, writes are attributed to the seeded viewer profile; linking it
 * to a session (`profiles.auth_user_id`) is what the RLS insert policies check.
 */

/** The seeded viewer: the author of anything written before auth lands. */
const VIEWER_PROFILE_ID: string = VIEWER_SEED.id;

/**
 * Live takes, hottest first (`for-you` is the whole live arena). The 24-hour
 * window is filtered in SQL by `expires_at`, never on the client — an expired
 * take cannot be rendered as live just because a device clock is wrong.
 */
export async function fetchTakes(hoodId: HoodId = 'for-you'): Promise<Take[]> {
  const live = requireSupabase()
    .from('takes')
    .select('*')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString());

  const scoped = hoodId === 'for-you' ? live : live.eq('hood', hoodId);
  const { data, error } = await scoped
    .order('heat', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) throw requestError(error);
  return data.map(toTake);
}

/**
 * Every profile, so a take by someone the device has never seen still resolves to
 * a real handle instead of falling back to the viewer.
 */
export async function fetchProfiles(): Promise<User[]> {
  const { data, error } = await requireSupabase().from('profiles').select('*').limit(200);

  if (error) throw requestError(error);
  return data.map(toUser);
}

/** A take's rebuttals, loudest first — the order the Clash screen consumes. */
export async function fetchComments(takeId: string): Promise<ChallengerComment[]> {
  const { data, error } = await requireSupabase()
    .from('comments')
    .select('*')
    .eq('take_id', takeId)
    .eq('is_removed', false)
    .order('upvotes_count', { ascending: false });

  if (error) throw requestError(error);
  return data.map(toComment);
}

/**
 * The rebuttals for a whole feed in one round trip — fetching per card would be one
 * query per take every time the Arena loads.
 */
export async function fetchCommentsForTakes(takeIds: readonly string[]): Promise<ChallengerComment[]> {
  if (takeIds.length === 0) return [];
  const { data, error } = await requireSupabase()
    .from('comments')
    .select('*')
    .in('take_id', [...takeIds])
    .eq('is_removed', false)
    .order('created_at', { ascending: false })
    .limit(400);

  if (error) throw requestError(error);
  return data.map(toComment);
}

/**
 * The viewer's own profile: the row linked to this session when the account has
 * been claimed, otherwise the seeded viewer the demo still writes as. Null keeps
 * the bundled snapshot in play instead of failing the whole hydration.
 */
export async function fetchViewerProfile(): Promise<User | null> {
  const client = requireSupabase();
  const uid = await currentUserId();
  if (uid) {
    const linked = await client.from('profiles').select('*').eq('auth_user_id', uid).maybeSingle();
    if (linked.error) throw requestError(linked.error);
    if (linked.data) return toUser(linked.data);
  }

  const seeded = await client.from('profiles').select('*').eq('id', VIEWER_PROFILE_ID).maybeSingle();
  if (seeded.error) throw requestError(seeded.error);
  return seeded.data ? toUser(seeded.data) : null;
}

/**
 * Comment ids this viewer has already upvoted. Without them the first tap on the
 * two-state toggle would withdraw a vote instead of casting one. RLS hands back an
 * empty list while the profile is still unlinked.
 */
export async function fetchViewerUpvoteIds(userId?: string): Promise<string[]> {
  // No resolved viewer, no votes: the seeded fallback must never stand in for a
  // linked profile — its rows would answer for the wrong person.
  if (!userId) return [];
  const { data, error } = await requireSupabase()
    .from('comment_upvotes')
    .select('comment_id')
    .eq('user_id', userId);

  if (error) throw requestError(error);
  return data.map((row) => row.comment_id);
}

/** Drops a take. `expires_at` and the counters are stamped by the database. */
export async function postTake(
  text: string,
  hood: DbHood,
  media?: PostTakeMedia,
  authorId: string = VIEWER_PROFILE_ID,
): Promise<Take> {
  await ensureSession();
  const { data, error } = await requireSupabase()
    .from('takes')
    .insert({
      id: `take-${Date.now()}`,
      author_id: authorId,
      hood,
      text,
      ...toPostMedia(media),
    })
    .select('*')
    .single();

  if (error) throw requestError(error);
  return toTake(data);
}

/** Posts a rebuttal on a take that is still live (the database enforces both). */
export async function postComment(
  takeId: string,
  text: string,
  authorId: string = VIEWER_PROFILE_ID,
): Promise<ChallengerComment> {
  await ensureSession();
  const { data, error } = await requireSupabase()
    .from('comments')
    .insert({
      id: `c-${Date.now()}`,
      take_id: takeId,
      author_id: authorId,
      text,
    })
    .select('*')
    .single();

  if (error) throw requestError(error);
  return toComment(data);
}

/**
 * Flips one upvote through `toggle_comment_upvote`, so the tally is recalculated
 * inside a single transaction instead of being written from the client.
 */
export async function toggleUpvote(
  commentId: string,
  userId: string = VIEWER_PROFILE_ID,
): Promise<UpvoteResult> {
  await ensureSession();
  const { data, error } = await requireSupabase().rpc('toggle_comment_upvote', {
    p_comment_id: commentId,
    p_user_id: userId,
  });

  if (error) throw requestError(error);
  return toUpvoteResult(data);
}

