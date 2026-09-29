/**
 * Safety: blocks, mutes and reports. All writes go through the server-side RPCs;
 * the caller is resolved from the session, never supplied by the client.
 */

import { currentViewerProfileId, fetchProfilesByIds } from './apiService';
import { requestError, requireSupabase, SupabaseError } from './supabaseClient';
import type { ReportReason, ReportTarget } from '../supabase/types';
import type { User } from '../store/types';

export async function blockProfile(profileId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('block_profile', { p_target_id: profileId });
  if (error) throw requestError(error);
}

export async function unblockProfile(profileId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('unblock_profile', { p_target_id: profileId });
  if (error) throw requestError(error);
}

export async function muteUser(profileId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('mute_profile', { p_target_id: profileId });
  if (error) throw requestError(error);
}

export async function unmuteUser(profileId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('unmute_profile', { p_target_id: profileId });
  if (error) throw requestError(error);
}

export async function reportContent(
  targetKind: ReportTarget,
  targetId: string,
  reason: ReportReason,
  detail?: string,
): Promise<string> {
  const { data, error } = await requireSupabase().rpc('submit_report', {
    p_target_kind: targetKind,
    p_target_id: targetId,
    p_reason: reason,
    p_detail: detail,
  });
  if (error) throw requestError(error);
  if (data === null) throw new SupabaseError('Report could not be created.', 'report');
  return data;
}

/** The profiles this viewer has muted — for a future muted-list UI. */
export async function fetchMutedProfiles(): Promise<User[]> {
  const me = await currentViewerProfileId();
  if (!me) return [];
  const { data, error } = await requireSupabase().from('mutes').select('muted_id').eq('muter_id', me);
  if (error) throw requestError(error);
  return fetchProfilesByIds(data.map((row) => row.muted_id));
}

export interface ViewerSafetyState {
  /** Profiles this viewer blocks (their content hidden from the viewer). */
  blockedProfileIds: string[];
  /** Profiles that block this viewer (their content hidden too). */
  blockingProfileIds: string[];
  /** Profiles this viewer mutes. */
  mutedProfileIds: string[];
}

/** The block/mute sets used to filter the viewer's feed. Empty for guests. */
export async function fetchViewerSafetyState(profileId: string | null): Promise<ViewerSafetyState> {
  if (!profileId) {
    return { blockedProfileIds: [], blockingProfileIds: [], mutedProfileIds: [] };
  }
  const client = requireSupabase();
  const [blocks, blockedBy, mutes] = await Promise.all([
    client.from('blocks').select('blocked_id').eq('blocker_id', profileId),
    client.from('blocks').select('blocker_id').eq('blocked_id', profileId),
    client.from('mutes').select('muted_id').eq('muter_id', profileId),
  ]);
  if (blocks.error) throw requestError(blocks.error);
  if (blockedBy.error) throw requestError(blockedBy.error);
  if (mutes.error) throw requestError(mutes.error);

  return {
    blockedProfileIds: blocks.data.map((row) => row.blocked_id),
    blockingProfileIds: blockedBy.data.map((row) => row.blocker_id),
    mutedProfileIds: mutes.data.map((row) => row.muted_id),
  };
}
