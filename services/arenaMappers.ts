import type { ChallengerComment, Take, TakeMedia, User } from '../store/types';
import type { Json, TableRow } from '../supabase/types';
import { gradient, type GradientColors } from '../theme';
import { SupabaseError } from './supabaseClient';

/**
 * Row ⇄ domain translation for the Arena.
 *
 * Everything the data API returns is snake_case Postgres; everything the UI knows
 * is `store/types.ts`. This file is the only place the two meet, so timestamps,
 * media and gradients are handled once, in one direction, with no casts.
 */

/** `expo-linear-gradient` needs two stops; anything shorter falls back to violet. */
function toGradient(colors: string[] | null): GradientColors {
  if (!colors || colors.length < 2) return gradient.violet;
  return [String(colors[0]), String(colors[1]), ...colors.slice(2).map(String)];
}

function toMedia(row: TableRow<'takes'>): TakeMedia | undefined {
  if (!row.media_kind) return undefined;
  return {
    kind: row.media_kind,
    caption: row.media_caption ?? '',
    colors: toGradient(row.media_colors),
    ...(row.media_url ? { url: row.media_url } : {}),
    ...(row.media_duration ? { duration: row.media_duration } : {}),
  };
}

/** Postgres timestamps are ISO strings; the store counts milliseconds. */
export function toTake(row: TableRow<'takes'>): Take {
  return {
    id: row.id,
    authorId: row.author_id,
    text: row.text,
    hood: row.hood,
    createdAt: Date.parse(row.created_at),
    expiresAt: Date.parse(row.expires_at),
    clashes: row.clashes_count,
    reactions: row.reactions_count,
    media: toMedia(row),
  };
}

export function toComment(row: TableRow<'comments'>): ChallengerComment {
  return {
    id: row.id,
    takeId: row.take_id,
    authorId: row.author_id,
    text: row.text,
    upvotes: row.upvotes_count,
    createdAt: Date.parse(row.created_at),
    ...(row.parent_comment_id ? { parentId: row.parent_comment_id } : {}),
  };
}

/**
 * A profile row as the app knows a person. `clashes`, `wins` and `badges` are not
 * columns yet — they belong to the §29 `reputation_events` / `hall_of_fame` tables
 * — so they hydrate empty instead of inventing a number.
 */
export function toUser(row: TableRow<'profiles'>): User {
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    ...(row.bio ? { bio: row.bio } : {}),
    tint: row.avatar_tint,
    hood: row.home_hood ?? 'for-you',
    rank: row.rank,
    reputation: row.reputation,
    coins: row.coins,
    clashes: 0,
    wins: 0,
    streak: row.streak,
    badges: [],
  };
}

/** What `toggle_comment_upvote` hands back once the vote has been flipped. */
export interface UpvoteResult {
  commentId: string;
  upvoted: boolean;
  upvotesCount: number;
}

/** The RPC answers with jsonb, so the shape is proven before it is trusted. */
export function toUpvoteResult(payload: Json | null): UpvoteResult {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as { [key: string]: Json | undefined };
    const id = record.comment_id;
    const upvoted = record.upvoted;
    const count = record.upvotes_count;
    if (typeof id === 'string' && typeof upvoted === 'boolean' && typeof count === 'number') {
      return { commentId: id, upvoted, upvotesCount: count };
    }
  }
  throw new SupabaseError('toggle_comment_upvote returned an unexpected payload', 'bad_payload');
}

/** What `toggle_take_reaction` hands back once the reaction has been flipped. */
export interface TakeReactionResult {
  takeId: string;
  reacted: boolean;
  reactionsCount: number;
}

/** The RPC answers with jsonb, so the shape is proven before it is trusted. */
export function toTakeReactionResult(payload: Json | null): TakeReactionResult {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as { [key: string]: Json | undefined };
    const id = record.take_id;
    const reacted = record.reacted;
    const count = record.reactions_count;
    if (typeof id === 'string' && typeof reacted === 'boolean' && typeof count === 'number') {
      return { takeId: id, reacted, reactionsCount: count };
    }
  }
  throw new SupabaseError('toggle_take_reaction returned an unexpected payload', 'bad_payload');
}
