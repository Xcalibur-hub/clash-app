/**
 * Safety: blocks, mutes and reports. All writes go through the server-side RPCs;
 * the caller is resolved from the session, never supplied by the client.
 */

import { currentViewerProfileId, fetchProfilesByIds } from './apiService';
import { currentUserId, requestError, requireSupabase, SupabaseError, type ClashSupabaseClient } from './supabaseClient';
import type { ReportReason, ReportTarget } from '../supabase/types';
import type { User } from '../store/types';

export async function blockProfile(profileId: string, account?: string): Promise<void> {
  return changeRelationship('block_profile', profileId, account);
}

export async function unblockProfile(profileId: string, account?: string): Promise<void> {
  return changeRelationship('unblock_profile', profileId, account);
}

export async function muteUser(profileId: string, account?: string): Promise<void> {
  return changeRelationship('mute_profile', profileId, account);
}

export async function unmuteUser(profileId: string, account?: string): Promise<void> {
  return changeRelationship('unmute_profile', profileId, account);
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

type SafetySession = { client: ClashSupabaseClient; token: string; signal: AbortSignal };

/** Bind every request to the initiating JWT, even if shared-client auth changes.
 * The server still verifies that JWT and derives the acting profile itself. */
async function withSafetySession<T>(expectedAccount: string | undefined, run: (session: SafetySession) => Promise<T>): Promise<T> {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  const session = data.session;
  if (error || !session || (expectedAccount && session.user.id !== expectedAccount)) {
    throw new SupabaseError('Sign in again to manage safety settings.', 'account_changed');
  }
  const controller = new AbortController();
  const { data: listener } = client.auth.onAuthStateChange((_event, next) => {
    if (next?.user.id !== session.user.id) controller.abort();
  });
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    if (await currentUserId() !== session.user.id) throw new SupabaseError('Account changed.', 'account_changed');
    const result = await run({ client, token: session.access_token, signal: controller.signal });
    if (controller.signal.aborted || await currentUserId() !== session.user.id) {
      throw new SupabaseError('Safety request interrupted. Refresh and try again.', 'account_changed');
    }
    return result;
  } finally {
    clearTimeout(timer);
    listener.subscription.unsubscribe();
  }
}

async function changeRelationship(rpc: 'block_profile' | 'unblock_profile' | 'mute_profile' | 'unmute_profile', target: string, account?: string): Promise<void> {
  return withSafetySession(account, async ({ client, token, signal }) => {
    const { error } = await client.rpc(rpc, { p_target_id: target })
      .setHeader('Authorization', `Bearer ${token}`).abortSignal(signal);
    if (error) throw requestError(error);
  });
}

export type SafetyListKind = 'blocked' | 'muted';
export interface SafetyAccount { id: string; name: string | null; handle: string | null }
export interface SafetyPage { items: SafetyAccount[]; nextCursor: string | null }

/** Owner-only, bounded keyset page. Target IDs are unique per owner. */
export async function fetchSafetyPage(kind: SafetyListKind, account: string, after?: string): Promise<SafetyPage> {
  return withSafetySession(account, async ({ client, token, signal }) => {
    const owner = await client.rpc('my_profile_id').setHeader('Authorization', `Bearer ${token}`).abortSignal(signal);
    if (owner.error) throw requestError(owner.error);
    if (!owner.data) throw new SupabaseError('Your profile is unavailable.', 'profile_missing');
    let ids: string[];
    if (kind === 'blocked') {
      let query = client.from('blocks').select('blocked_id').eq('blocker_id', owner.data).order('blocked_id').limit(51);
      if (after) query = query.gt('blocked_id', after);
      const result = await query.setHeader('Authorization', `Bearer ${token}`).abortSignal(signal);
      if (result.error) throw requestError(result.error);
      ids = result.data.map(row => row.blocked_id);
    } else {
      let query = client.from('mutes').select('muted_id').eq('muter_id', owner.data).order('muted_id').limit(51);
      if (after) query = query.gt('muted_id', after);
      const result = await query.setHeader('Authorization', `Bearer ${token}`).abortSignal(signal);
      if (result.error) throw requestError(result.error);
      ids = result.data.map(row => row.muted_id);
    }
    const page = ids.slice(0, 50);
    if (!page.length) return { items: [], nextCursor: null };
    const profiles = await client.from('profiles').select('id,name,handle').in('id', page)
      .setHeader('Authorization', `Bearer ${token}`).abortSignal(signal);
    if (profiles.error) throw requestError(profiles.error);
    const byId = new Map(profiles.data.map(row => [row.id, row]));
    return {
      items: page.map(id => ({ id, name: byId.get(id)?.name ?? null, handle: byId.get(id)?.handle ?? null })),
      nextCursor: ids.length > 50 ? page[page.length - 1] : null,
    };
  });
}
