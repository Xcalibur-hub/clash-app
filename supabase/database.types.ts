/**
 * Typed mirror of `supabase/schema.sql` for the supabase-js data API.
 *
 * Keep this file in lockstep with the SQL. Once the CLI is linked it can be
 * regenerated instead of hand-edited:
 *
 *   supabase gen types typescript --project-id <ref> > supabase/database.types.ts
 *
 * The shape matches what that command emits (postgrest-js `GenericSchema`), so
 * `supabase.from('takes').select('*')` returns `TakeRow[]` — no `any`, no casts.
 */
import type { HoodId, MediaKind, RankName } from '../store/types';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Real hoods (`for-you` is a feed scope, not a row). */
export type DbHood = Exclude<HoodId, 'for-you'>;

/** Permission tier on `profiles.role` (spec §30 moderation). */
export type ProfileRole = 'viewer' | 'creator' | 'moderator' | 'admin';

export type TakeStatus = 'active' | 'expired' | 'removed';

/** Columns with a database default / nullable value: the client may omit them. */
type Defaulted<Row, K extends keyof Row> = Omit<Row, K> & Partial<Pick<Row, K>>;

/** A declared foreign key, as `supabase gen types` writes it. */
type Rel<Name extends string, Columns extends string[], Target extends string> = {
  foreignKeyName: Name;
  columns: Columns;
  isOneToOne: false;
  referencedRelation: Target;
  referencedColumns: ['id'];
};

export type ProfileRow = {
  id: string;
  /** Links the profile to a Supabase Auth user; null for seeded demo people. */
  auth_user_id: string | null;
  handle: string;
  name: string;
  avatar_tint: string;
  bio: string | null;
  home_hood: DbHood | null;
  role: ProfileRole;
  moderated_hoods: DbHood[];
  reputation: number;
  coins: number;
  streak: number;
  rank: RankName;
  created_at: string;
  updated_at: string;
};

export type TakeRow = {
  id: string;
  author_id: string;
  hood: DbHood;
  text: string;
  media_url: string | null;
  media_kind: MediaKind | null;
  media_caption: string | null;
  /** Gradient plate stops — the mocked stand-in for an upload (spec §7). */
  media_colors: string[] | null;
  media_duration: string | null;
  created_at: string;
  expires_at: string;
  status: TakeStatus;
  clashes_count: number;
  reactions_count: number;
  /** Generated column: `clashes_count * 3 + reactions_count`, the feed rank. */
  heat: number;
};

export type CommentRow = {
  id: string;
  take_id: string;
  author_id: string;
  text: string;
  upvotes_count: number;
  is_removed: boolean;
  is_pinned: boolean;
  created_at: string;
};

export type CommentUpvoteRow = {
  comment_id: string;
  user_id: string;
  created_at: string;
};

/** `toggle_comment_upvote` returns this as jsonb. */
export type ToggleUpvotePayload = {
  comment_id: string;
  upvoted: boolean;
  upvotes_count: number;
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Defaulted<
          ProfileRow,
          | 'auth_user_id'
          | 'avatar_tint'
          | 'bio'
          | 'home_hood'
          | 'role'
          | 'moderated_hoods'
          | 'reputation'
          | 'coins'
          | 'streak'
          | 'rank'
          | 'created_at'
          | 'updated_at'
        >;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      takes: {
        Row: TakeRow;
        Insert: Defaulted<
          TakeRow,
          | 'media_url'
          | 'media_kind'
          | 'media_caption'
          | 'media_colors'
          | 'media_duration'
          | 'created_at'
          | 'expires_at'
          | 'status'
          | 'clashes_count'
          | 'reactions_count'
          | 'heat'
        >;
        Update: Partial<TakeRow>;
        Relationships: [Rel<'takes_author_id_fkey', ['author_id'], 'profiles'>];
      };
      comments: {
        Row: CommentRow;
        Insert: Defaulted<
          CommentRow,
          'upvotes_count' | 'is_removed' | 'is_pinned' | 'created_at'
        >;
        Update: Partial<CommentRow>;
        Relationships: [
          Rel<'comments_take_id_fkey', ['take_id'], 'takes'>,
          Rel<'comments_author_id_fkey', ['author_id'], 'profiles'>,
        ];
      };
      comment_upvotes: {
        Row: CommentUpvoteRow;
        Insert: Defaulted<CommentUpvoteRow, 'created_at'>;
        Update: Partial<CommentUpvoteRow>;
        Relationships: [
          Rel<'comment_upvotes_comment_id_fkey', ['comment_id'], 'comments'>,
          Rel<'comment_upvotes_user_id_fkey', ['user_id'], 'profiles'>,
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      /** Flips one vote for `p_user_id` and returns the fresh tally. */
      toggle_comment_upvote: {
        Args: { p_comment_id: string; p_user_id: string };
        Returns: Json;
      };
    };
    Enums: {
      hood_id: DbHood;
      media_kind: MediaKind;
      take_status: TakeStatus;
      profile_role: ProfileRole;
      rank_name: RankName;
    };
    CompositeTypes: { [_ in never]: never };
  };
}

type Schema = Database['public'];

export type TableRow<K extends keyof Schema['Tables']> = Schema['Tables'][K]['Row'];
export type TableInsert<K extends keyof Schema['Tables']> = Schema['Tables'][K]['Insert'];
