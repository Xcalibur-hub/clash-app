/**
 * Social graph (follows) over the server-side RPCs. The caller is always the
 * signed-in user — no id is ever supplied for the current actor.
 */

import { currentViewerProfileId, fetchProfilesByIds } from './apiService';
import { requestError, requireSupabase } from './supabaseClient';
import type { User } from '../store/types';

export async function followUser(profileId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('follow_profile', { p_target_id: profileId });
  if (error) throw requestError(error);
}

export async function unfollowUser(profileId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('unfollow_profile', { p_target_id: profileId });
  if (error) throw requestError(error);
}

export interface FollowState {
  following: boolean;
  followerCount: number;
  followingCount: number;
}

/** Whether the viewer follows `profileId`, plus both public counts. */
export async function fetchFollowState(profileId: string): Promise<FollowState> {
  const client = requireSupabase();
  const me = await currentViewerProfileId();

  const [followers, following] = await Promise.all([
    client.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', profileId),
    client.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', profileId),
  ]);
  if (followers.error) throw requestError(followers.error);
  if (following.error) throw requestError(following.error);

  let isFollowing = false;
  if (me) {
    const mine = await client
      .from('follows')
      .select('follower_id')
      .eq('follower_id', me)
      .eq('following_id', profileId)
      .maybeSingle();
    if (mine.error) throw requestError(mine.error);
    isFollowing = mine.data !== null;
  }

  return {
    following: isFollowing,
    followerCount: followers.count ?? 0,
    followingCount: following.count ?? 0,
  };
}

export async function fetchFollowers(profileId: string): Promise<User[]> {
  const { data, error } = await requireSupabase()
    .from('follows')
    .select('follower_id')
    .eq('following_id', profileId);
  if (error) throw requestError(error);
  return fetchProfilesByIds(data.map((row) => row.follower_id));
}

export async function fetchFollowing(profileId: string): Promise<User[]> {
  const { data, error } = await requireSupabase()
    .from('follows')
    .select('following_id')
    .eq('follower_id', profileId);
  if (error) throw requestError(error);
  return fetchProfilesByIds(data.map((row) => row.following_id));
}

/** Just the ids this profile follows — used by the Following feed scope. */
export async function fetchFollowingIds(profileId: string): Promise<string[]> {
  const { data, error } = await requireSupabase()
    .from('follows')
    .select('following_id')
    .eq('follower_id', profileId);
  if (error) throw requestError(error);
  return data.map((row) => row.following_id);
}
