/**
 * Creator Communities API (Phase 15.2).
 *
 * Every read/write goes through a SECURITY DEFINER RPC that resolves the caller
 * from the session; the client never supplies an author id and never decides
 * access. The only direct table read is the creator's own community row for the
 * Studio (RLS limits it to the owner / staff).
 */

import { currentViewerProfileId } from './apiService';
import { getPublicMediaUrl } from './mediaService';
import { requestError, requireSupabase, SupabaseError } from './supabaseClient';
import {
  toCommunityPostCard,
  toCommunityPostList,
  toCommunityReplyCard,
  toCommunityReplyList,
  toCommunitySettings,
  toCommunitySummary,
  type CommunityAccessType,
  type CommunityMedia,
  type CommunityPostCard,
  type CommunityPostType,
  type CommunityReplyCard,
  type CommunitySettings,
  type CommunityStatus,
  type CommunitySummary,
} from './vaultCommunityMappers';

export function communityCoverUrl(media: CommunityMedia | null | undefined): string | null {
  if (!media) return null;
  try {
    return getPublicMediaUrl(media.bucket, media.path);
  } catch {
    return null;
  }
}

// ── Reads ───────────────────────────────────────────────────────────────────

/** A creator's community summary (or null) for the Creator World chapter. */
export async function fetchCreatorCommunity(creatorId: string): Promise<CommunitySummary | null> {
  const { data, error } = await requireSupabase().rpc('vault_community_for_creator', {
    p_creator_id: creatorId,
  });
  if (error) throw requestError(error);
  return toCommunitySummary(data);
}

/** The community summary for a viewer, including their access answer. */
export async function fetchCommunity(communityId: string): Promise<CommunitySummary | null> {
  const { data, error } = await requireSupabase().rpc('vault_community_summary', {
    p_community_id: communityId,
  });
  if (error) throw requestError(error);
  return toCommunitySummary(data);
}

/**
 * Records membership + last-seen and returns the summary. Throws a typed error
 * (P0005) when the server refuses access — the client never fakes entry.
 */
export async function enterCommunity(communityId: string): Promise<CommunitySummary> {
  const { data, error } = await requireSupabase().rpc('enter_vault_community', {
    p_community_id: communityId,
  });
  if (error) throw requestError(error);
  const summary = toCommunitySummary(data);
  if (!summary) throw new SupabaseError('enter_vault_community returned no community', 'bad_payload');
  return summary;
}

export interface CommunityPostPage {
  limit?: number;
  beforeCreatedAt?: number | null;
  beforeId?: string | null;
}

export async function fetchCommunityPosts(
  communityId: string,
  page: CommunityPostPage = {},
): Promise<CommunityPostCard[]> {
  const { data, error } = await requireSupabase().rpc('list_vault_community_posts', {
    p_community_id: communityId,
    p_limit: page.limit ?? 20,
    p_before_created_at:
      page.beforeCreatedAt != null ? new Date(page.beforeCreatedAt).toISOString() : undefined,
    p_before_id: page.beforeId ?? undefined,
  });
  if (error) throw requestError(error);
  return toCommunityPostList(data);
}

export async function fetchCommunityReplies(
  postId: string,
  limit = 50,
): Promise<CommunityReplyCard[]> {
  const { data, error } = await requireSupabase().rpc('list_vault_community_replies', {
    p_post_id: postId,
    p_limit: limit,
  });
  if (error) throw requestError(error);
  return toCommunityReplyList(data);
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function createCommunityPost(input: {
  communityId: string;
  type: CommunityPostType;
  body: string;
  mediaObjectId?: string | null;
  pseudonymous?: boolean;
}): Promise<CommunityPostCard> {
  const { data, error } = await requireSupabase().rpc('create_vault_community_post', {
    p_community_id: input.communityId,
    p_post_type: input.type,
    p_body: input.body,
    p_media_object_id: input.mediaObjectId ?? undefined,
    p_pseudonymous: input.pseudonymous ?? false,
  });
  if (error) throw requestError(error);
  const card = toCommunityPostCard(data);
  if (!card) throw new SupabaseError('create_vault_community_post returned no post', 'bad_payload');
  return card;
}

export async function createCommunityReply(input: {
  postId: string;
  parentReplyId?: string | null;
  body: string;
  pseudonymous?: boolean;
}): Promise<CommunityReplyCard> {
  const { data, error } = await requireSupabase().rpc('create_vault_community_reply', {
    p_post_id: input.postId,
    p_parent_reply_id: input.parentReplyId ?? undefined,
    p_body: input.body,
    p_pseudonymous: input.pseudonymous ?? false,
  });
  if (error) throw requestError(error);
  const card = toCommunityReplyCard(data);
  if (!card) throw new SupabaseError('create_vault_community_reply returned no reply', 'bad_payload');
  return card;
}

export async function deleteCommunityPost(postId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('delete_vault_community_post', { p_post_id: postId });
  if (error) throw requestError(error);
}

export async function deleteCommunityReply(replyId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('delete_vault_community_reply', { p_reply_id: replyId });
  if (error) throw requestError(error);
}

export async function hideCommunityPost(postId: string, hidden: boolean): Promise<void> {
  const { error } = await requireSupabase().rpc('hide_vault_community_post', {
    p_post_id: postId,
    p_hidden: hidden,
  });
  if (error) throw requestError(error);
}

// ── Creator Studio ──────────────────────────────────────────────────────────

/** The signed-in creator's own community row (drafts/disabled included). */
export async function fetchMyCommunity(): Promise<CommunitySettings | null> {
  const me = await currentViewerProfileId();
  if (!me) return null;
  const { data, error } = await requireSupabase()
    .from('vault_communities')
    .select('*')
    .eq('creator_id', me)
    .maybeSingle();
  if (error) throw requestError(error);
  return data ? toCommunitySettings(data) : null;
}

export interface CommunitySettingsInput {
  name: string;
  description?: string;
  accessType?: CommunityAccessType;
  pseudonymousEnabled?: boolean;
  rules?: string;
  iconMediaObjectId?: string | null;
}

export async function createCommunity(input: CommunitySettingsInput): Promise<CommunitySettings> {
  const { data, error } = await requireSupabase().rpc('create_vault_community', {
    p_name: input.name,
    p_description: input.description ?? '',
    p_access_type: input.accessType ?? 'public',
    p_pseudonymous_enabled: input.pseudonymousEnabled ?? false,
    p_rules: input.rules ?? '',
    p_icon_media_object_id: input.iconMediaObjectId ?? undefined,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('create_vault_community returned no row', 'bad_payload');
  return toCommunitySettings(data);
}

export async function updateCommunity(
  communityId: string,
  input: CommunitySettingsInput,
): Promise<CommunitySettings> {
  const { data, error } = await requireSupabase().rpc('update_vault_community', {
    p_community_id: communityId,
    p_name: input.name,
    p_description: input.description ?? '',
    p_access_type: input.accessType ?? 'public',
    p_pseudonymous_enabled: input.pseudonymousEnabled ?? false,
    p_rules: input.rules ?? '',
    p_icon_media_object_id: input.iconMediaObjectId ?? undefined,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('update_vault_community returned no row', 'bad_payload');
  return toCommunitySettings(data);
}

export async function setCommunityStatus(
  communityId: string,
  status: CommunityStatus,
): Promise<CommunitySettings> {
  const { data, error } = await requireSupabase().rpc('set_vault_community_status', {
    p_community_id: communityId,
    p_status: status,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('set_vault_community_status returned no row', 'bad_payload');
  return toCommunitySettings(data);
}
