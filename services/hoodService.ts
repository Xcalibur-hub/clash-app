/**
 * Hood community APIs. Membership is real (`hood_memberships`); counts derive
 * from rows, never from client metadata.
 */

import type { Hood, HoodId } from '../store/types';
import { HOODS } from '../data/hoods';
import { requestError, requireSupabase } from './supabaseClient';

/** A concrete community slug — `hood_id` has no 'for-you'. */
type HoodSlug = Exclude<HoodId, 'for-you'>;

export interface HoodOverview {
  memberCount: number;
  /** Whether the signed-in viewer has joined this Hood. */
  joined: boolean;
  /** Live Takes currently in this Hood. */
  liveCount: number;
}

export async function joinHood(hood: HoodSlug): Promise<void> {
  const { error } = await requireSupabase().rpc('join_hood', { p_hood: hood });
  if (error) throw requestError(error);
}

export async function leaveHood(hood: HoodSlug): Promise<void> {
  const { error } = await requireSupabase().rpc('leave_hood', { p_hood: hood });
  if (error) throw requestError(error);
}

/** Hood ids the viewer has joined. Empty for a guest. */
export async function fetchMyHoodIds(profileId?: string | null): Promise<string[]> {
  if (!profileId) return [];
  const { data, error } = await requireSupabase()
    .from('hood_memberships')
    .select('hood')
    .eq('profile_id', profileId);
  if (error) throw requestError(error);
  return data.map((row) => row.hood);
}

/** Real member count + join state + live Take count for a Hood page. */
export async function fetchHoodOverview(
  hood: HoodSlug,
  profileId?: string | null,
): Promise<HoodOverview> {
  const client = requireSupabase();
  const [memberCount, liveCount] = await Promise.all([
    client.from('hood_memberships').select('hood', { count: 'exact', head: true }).eq('hood', hood),
    client
      .from('takes')
      .select('id', { count: 'exact', head: true })
      .eq('hood', hood)
      .eq('status', 'active')
      .filter('is_runtime_fixture', 'eq', false)
      .gt('expires_at', new Date().toISOString()),
  ]);
  if (memberCount.error) throw requestError(memberCount.error);
  if (liveCount.error) throw requestError(liveCount.error);

  let joined = false;
  if (profileId) {
    const mine = await client
      .from('hood_memberships')
      .select('hood')
      .eq('hood', hood)
      .eq('profile_id', profileId)
      .maybeSingle();
    if (mine.error) throw requestError(mine.error);
    joined = mine.data !== null;
  }

  return { memberCount: memberCount.count ?? 0, joined, liveCount: liveCount.count ?? 0 };
}

/** One Hood in the Explore discovery shelf: static metadata + real counts + join state. */
export interface HoodSummary {
  hood: Hood;
  memberCount: number;
  liveCount: number;
  joined: boolean;
}

/**
 * Every Hood with real membership and live-Take counts in a single round trip.
 * Counts derive from rows, never from the static catalogue metadata.
 */
export async function fetchHoodSummaries(profileId?: string | null): Promise<HoodSummary[]> {
  const client = requireSupabase();
  const [memberships, liveTakes] = await Promise.all([
    client.from('hood_memberships').select('hood'),
    client
      .from('takes')
      .select('hood')
      .eq('status', 'active')
      .filter('is_runtime_fixture', 'eq', false)
      .gt('expires_at', new Date().toISOString()),
  ]);
  if (memberships.error) throw requestError(memberships.error);
  if (liveTakes.error) throw requestError(liveTakes.error);

  const memberCounts = new Map<string, number>();
  for (const row of memberships.data ?? []) {
    memberCounts.set(row.hood, (memberCounts.get(row.hood) ?? 0) + 1);
  }
  const liveCounts = new Map<string, number>();
  for (const row of liveTakes.data ?? []) {
    liveCounts.set(row.hood, (liveCounts.get(row.hood) ?? 0) + 1);
  }

  let joinedHoods: string[] = [];
  if (profileId) {
    const mine = await client.from('hood_memberships').select('hood').eq('profile_id', profileId);
    if (mine.error) throw requestError(mine.error);
    joinedHoods = (mine.data ?? []).map((row) => row.hood);
  }
  const joined = new Set(joinedHoods);

  return HOODS.map((hood) => ({
    hood,
    memberCount: memberCounts.get(hood.id) ?? 0,
    liveCount: liveCounts.get(hood.id) ?? 0,
    joined: joined.has(hood.id),
  }));
}
