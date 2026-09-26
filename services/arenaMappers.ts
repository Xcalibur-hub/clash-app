import type { ChallengerComment, MediaKind, Take, TakeMedia, User } from '../store/types';
import type { Json, TableInsert, TableRow } from '../supabase/database.types';
import { gradient, type GradientColors } from '../theme';
import { SupabaseError } from './supabaseClient';

/**
 * Row ⇄ domain translation for the Arena.
 *
 * Everything the data API returns is snake_case Postgres; everything the UI knows
 * is `store/types.ts`. This file is the only place the two meet, so timestamps,
 * media and gradients are handled once, in one direction, with no casts.
 */

/** Media attached to a new take — a URL plus the plate the app renders. */
export interface PostTakeMedia {
  url: string;
  kind: MediaKind;
  caption?: string;
  colors?: GradientColors;
  duration?: string;
}

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
  };
}

/** Only the media columns, so an insert never carries server-owned values. */
export function toPostMedia(media: PostTakeMedia | undefined): Partial<TableInsert<'takes'>> {
  if (!media) return {};
  return {
    media_url: media.url,
    media_kind: media.kind,
    media_caption: media.caption ?? null,
    media_colors: media.colors ? [...media.colors] : null,
    media_duration: media.duration ?? null,
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
