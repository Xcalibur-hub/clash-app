/**
 * Creator World Drops API (Phase 15.3).
 *
 * Claims are server-authoritative and idempotent; the client never decides a
 * reward. Everything reuses the existing World RPCs (`world_drop_view`) and the
 * existing coarse-location model — precise coordinates go only into RPCs.
 */

import { getPublicMediaUrl } from './mediaService';
import { requestError, requireSupabase, SupabaseError } from './supabaseClient';
import {
  toCreatorDropClaim,
  toCreatorWorldDrop,
  toCreatorWorldDropList,
  toWorldArtifactList,
  parseCreatorDropMedia,
  type CreatorDropClaim,
  type CreatorDropMedia,
  type CreatorDropReward,
  type CreatorDropType,
  type CreatorWorldDrop,
  type WorldArtifact,
} from './creatorWorldDropMappers';

export function creatorDropMediaUrl(media: CreatorDropMedia | null | undefined): string | null {
  if (!media) return null;
  try {
    return getPublicMediaUrl(media.bucket, media.path);
  } catch {
    return null;
  }
}

export interface CreateWorldDropInput {
  caption: string;
  clue?: string;
  dropType: CreatorDropType;
  rewardType: CreatorDropReward;
  rewardRef?: string | null;
  mediaObjectId?: string | null;
  latitude: number;
  longitude: number;
  locationLabel?: string | null;
  expiresAt?: number | null;
}

/** A creator's published, unexpired World Drops (block-aware). */
export async function fetchCreatorWorldDrops(
  creatorId: string,
  limit = 20,
): Promise<CreatorWorldDrop[]> {
  const { data, error } = await requireSupabase().rpc('list_creator_world_drops', {
    p_creator_id: creatorId,
    p_limit: limit,
  });
  if (error) throw requestError(error);
  return toCreatorWorldDropList(data);
}

/** The signed-in creator's own drops, drafts included (Studio). */
export async function fetchMyCreatorWorldDrops(limit = 30): Promise<CreatorWorldDrop[]> {
  const { data, error } = await requireSupabase().rpc('world_my_creator_drops', { p_limit: limit });
  if (error) throw requestError(error);
  return toCreatorWorldDropList(data);
}

/** Cross-creator shelf used by Explore Play. */
export async function fetchExploreWorldDrops(limit = 20): Promise<CreatorWorldDrop[]> {
  const { data, error } = await requireSupabase().rpc('list_explore_world_drops', { p_limit: limit });
  if (error) throw requestError(error);
  return toCreatorWorldDropList(data);
}

/** Single drop (existing World read path — never exposes the reward). */
export async function fetchCreatorWorldDrop(dropId: string): Promise<CreatorWorldDrop | null> {
  const { data, error } = await requireSupabase().rpc('world_drop_view', { p_drop_id: dropId });
  if (error) throw requestError(error);
  if (data === null) return null;
  return toCreatorWorldDrop(data);
}

/** Idempotent claim. Safe to replay; a second call returns alreadyClaimed. */
export async function claimWorldDrop(dropId: string): Promise<CreatorDropClaim> {
  const { data, error } = await requireSupabase().rpc('claim_world_drop', { p_drop_id: dropId });
  if (error) throw requestError(error);
  const claim = toCreatorDropClaim(data);
  if (!claim) throw new SupabaseError('claim_world_drop returned no reward', 'bad_payload');
  return claim;
}

/** The viewer's discovered artifacts (lightweight collection). */
export async function fetchMyWorldArtifacts(limit = 40): Promise<WorldArtifact[]> {
  const { data, error } = await requireSupabase().rpc('get_my_world_artifacts', { p_limit: limit });
  if (error) throw requestError(error);
  return toWorldArtifactList(data);
}

export async function createCreatorWorldDrop(input: CreateWorldDropInput): Promise<string> {
  const { data, error } = await requireSupabase().rpc('create_creator_world_drop', {
    p_caption: input.caption,
    p_clue: input.clue ?? '',
    p_drop_type: input.dropType,
    p_reward_type: input.rewardType,
    p_reward_ref: input.rewardRef ?? undefined,
    p_media_object_id: input.mediaObjectId ?? undefined,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_location_label: input.locationLabel ?? undefined,
    p_expires_at: input.expiresAt != null ? new Date(input.expiresAt).toISOString() : undefined,
  });
  if (error) throw requestError(error);
  const row = data as { id?: unknown } | null;
  if (!row || typeof row.id !== 'string') {
    throw new SupabaseError('create_creator_world_drop returned no row', 'bad_payload');
  }
  return row.id;
}

export async function setCreatorWorldDropStatus(
  dropId: string,
  status: 'DRAFT' | 'PUBLISHED' | 'REMOVED',
): Promise<void> {
  const { error } = await requireSupabase().rpc('set_creator_world_drop_status', {
    p_drop_id: dropId,
    p_status: status,
  });
  if (error) throw requestError(error);
}

export { parseCreatorDropMedia };