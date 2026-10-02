import type { ChallengerComment, HoodId, MediaKind, Take, User } from '../store/types';
import type { DbHood } from '../supabase/types';
import {
  toComment,
  toTake,
  toTakeReactionResult,
  toUpvoteResult,
  toUser,
  type TakeReactionResult,
  type UpvoteResult,
} from './arenaMappers';
import { currentUserId, requestError, requireSupabase, SupabaseError } from './supabaseClient';
import { requireUserId } from './authService';

export type { TakeReactionResult, UpvoteResult } from './arenaMappers';

/**
 * The Arena's data API: one function per query the app needs, each answering with
 * the domain types the store already uses (`store/types.ts`), so a screen swaps a
 * selector for a fetch without learning a second vocabulary. Rows never leak out —
 * `services/arenaMappers.ts` owns the snake_case → camelCase translation.
 *
 * Writes resolve the author from the authenticated session
 * (`requireViewerProfileId`) and never fall back to a seeded identity — a
 * signed-out caller cannot write at all.
 */

/**
 * Live takes, hottest first (`for-you` is the whole live arena). The 24-hour
 * window is filtered in SQL by `expires_at`, never on the client — an expired
 * take cannot be rendered as live just because a device clock is wrong.
 */
export async function fetchTakes(
  hoodId: HoodId = 'for-you',
  excludeAuthorIds: readonly string[] = [],
): Promise<Take[]> {
  let live = requireSupabase()
    .from('takes')
    .select('*')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString());

  if (excludeAuthorIds.length > 0) {
    live = live.not('author_id', 'in', [...excludeAuthorIds]);
  }

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

/** A specific set of profiles, in id order — for follower/following/mute lists. */
export async function fetchProfilesByIds(ids: readonly string[]): Promise<User[]> {
  if (ids.length === 0) return [];
  const { data, error } = await requireSupabase().from('profiles').select('*').in('id', [...ids]);

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
 * The profile id owned by the signed-in user — the single place writes learn who
 * they act as. Throws when signed out or when the profile is missing, so a write
 * can never fall back to a seeded identity or impersonate another user.
 */
export async function requireViewerProfileId(): Promise<string> {
  const uid = await requireUserId();
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('id')
    .eq('auth_user_id', uid)
    .maybeSingle();
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('Your profile is missing. Sign out and back in.', 'profile_missing');
  return data.id;
}

/** The signed-in user's profile id, or null for a guest. Reads-only, never throws. */
export async function currentViewerProfileId(): Promise<string | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('id')
    .eq('auth_user_id', uid)
    .maybeSingle();
  if (error) throw requestError(error);
  return data?.id ?? null;
}

/**
 * The viewer's own profile: the row linked to this session. Null for a signed-out
 * guest, which keeps the demo snapshot in play for read-only browsing.
 */
export async function fetchViewerProfile(): Promise<User | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('*')
    .eq('auth_user_id', uid)
    .maybeSingle();
  if (error) throw requestError(error);
  return data ? toUser(data) : null;
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

/** Media already uploaded to `media_objects` and ready to attach to a new Take. */
export interface NewTakeMedia {
  mediaObjectId: string;
  /** Public rendering URL derived via `getPublicMediaUrl`. */
  url: string;
  kind: MediaKind;
  /** Still poster for video — image URL only, never the video bytes. */
  posterUrl?: string;
}

/**
 * Drops a Take through the server-authoritative `create_take` RPC. The author,
 * 24-hour window, status and counters are stamped by the database; media (when
 * supplied) must already be a completed, public object the caller owns.
 */
export async function postTake(
  text: string,
  hood: DbHood,
  media?: NewTakeMedia,
): Promise<Take> {
  const { data, error } = await requireSupabase().rpc('create_take', {
    p_hood: hood,
    p_text: text,
    ...(media
      ? {
          p_media_object_id: media.mediaObjectId,
          p_media_url: media.url,
          ...(media.posterUrl ? { p_media_poster_url: media.posterUrl } : {}),
        }
      : {}),
  });

  if (error) throw requestError(error);
  const row = data?.[0];
  if (!row) throw new SupabaseError('create_take returned no row', 'bad_payload');
  return toTake(row);
}

/** Media already uploaded and ready to attach to a rebuttal. */
export type NewCommentMedia = NewTakeMedia;

/** Validated Tenor GIF attachment (no storage upload). */
export interface NewCommentGif {
  provider: 'tenor';
  externalId: string;
  /** Allowed Tenor CDN URL (tinygif/share). */
  url: string;
}

/**
 * Posts a rebuttal (or reply) through `create_comment`. Author and media
 * ownership are server-stamped; empty (no text and no media) is rejected.
 */
export async function postComment(
  takeId: string,
  text: string,
  parentId?: string,
  media?: NewCommentMedia,
  gif?: NewCommentGif,
): Promise<ChallengerComment> {
  if (media && gif) {
    throw new SupabaseError('Choose either an upload or a GIF, not both', 'bad_payload');
  }
  const { data, error } = await requireSupabase().rpc('create_comment', {
    p_take_id: takeId,
    p_text: text,
    ...(parentId ? { p_parent_comment_id: parentId } : {}),
    ...(media
      ? { p_media_object_id: media.mediaObjectId, p_media_url: media.url }
      : {}),
    ...(gif
      ? {
          p_media_url: gif.url,
          p_gif_provider: gif.provider,
          p_gif_external_id: gif.externalId,
        }
      : {}),
  });

  if (error) throw requestError(error);
  const row = data?.[0];
  if (!row) throw new SupabaseError('create_comment returned no row', 'bad_payload');
  return toComment(row);
}

/**
 * Flips one upvote through `toggle_comment_upvote`, so the tally is recalculated
 * inside a single transaction instead of being written from the client.
 */
export async function toggleUpvote(commentId: string): Promise<UpvoteResult> {
  const userId = await requireViewerProfileId();
  const { data, error } = await requireSupabase().rpc('toggle_comment_upvote', {
    p_comment_id: commentId,
    p_user_id: userId,
  });

  if (error) throw requestError(error);
  return toUpvoteResult(data);
}

/**
 * Toggles the viewer's reaction on a Take through `toggle_take_reaction` — the
 * server owns both the row and the aggregate, so the client never writes a count.
 */
export async function toggleTakeReaction(takeId: string): Promise<TakeReactionResult> {
  const { data, error } = await requireSupabase().rpc('toggle_take_reaction', {
    p_take_id: takeId,
  });

  if (error) throw requestError(error);
  return toTakeReactionResult(data);
}

/**
 * Take ids this viewer has reacted to. Empty for a guest — the seeded fallback
 * must never stand in for a linked profile.
 */
export async function fetchMyTakeReactionIds(userId?: string): Promise<string[]> {
  if (!userId) return [];
  const { data, error } = await requireSupabase()
    .from('take_reactions')
    .select('take_id')
    .eq('user_id', userId);

  if (error) throw requestError(error);
  return data.map((row) => row.take_id);
}

/** A single Take by id, regardless of live status (used for Clash context). */
export async function fetchTakeById(takeId: string): Promise<Take | null> {
  const { data, error } = await requireSupabase().from('takes').select('*').eq('id', takeId).maybeSingle();
  if (error) throw requestError(error);
  return data ? toTake(data) : null;
}

/** A single rebuttal by id (null when removed/unavailable via RLS). */
export async function fetchCommentById(commentId: string): Promise<ChallengerComment | null> {
  const { data, error } = await requireSupabase().from('comments').select('*').eq('id', commentId).maybeSingle();
  if (error) throw requestError(error);
  return data ? toComment(data) : null;
}

