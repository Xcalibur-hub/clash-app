/**
 * Persistent Clash following (Step 4A).
 *
 * A follow is always on the canonical clash id, never on a room. Writes are
 * server-identified RPCs; reads are bounded RPCs so the client never needs
 * direct table access. Every call re-checks that the signed-in account has not
 * changed while the request was in flight.
 */
import type { PostgrestError } from '@supabase/supabase-js';
import { currentUserId, requireSupabase, requestError } from './supabaseClient';

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: PostgrestError | null;
  }>;
};

const callRpc = (name: string, args: Record<string, unknown>) =>
  (requireSupabase() as unknown as RpcClient).rpc(name, args);

async function guard(account: string, active: () => boolean): Promise<void> {
  if (!active() || (await currentUserId()) !== account || !active()) {
    throw new Error('account_changed');
  }
}

/** Whether the signed-in viewer currently follows this Clash. */
export async function fetchClashFollowState(
  account: string,
  clashId: string,
  active: () => boolean = () => true,
): Promise<boolean> {
  const { data, error } = await callRpc('is_following_clash', { p_clash_id: clashId });
  if (error) throw requestError(error);
  await guard(account, active);
  return data === true;
}

/** Idempotent follow/unfollow. Throws when the Clash is not available. */
export async function setClashFollow(
  account: string,
  clashId: string,
  following: boolean,
  active: () => boolean = () => true,
): Promise<void> {
  // Validate the expected account and live session BEFORE dispatch, so a stale
  // action from account A can never execute as account B after a session change.
  await guard(account, active);
  const { error } = await callRpc(following ? 'follow_clash' : 'unfollow_clash', {
    p_clash_id: clashId,
    // Compare-and-set on the server: if the session switches between this
    // guard and token acquisition, the RPC sees a different my_profile_id()
    // and refuses, so nothing is written for the wrong account.
    p_expected_profile: account,
  });
  if (error) throw requestError(error);
  await guard(account, active);
}

/** Up to 30 followed Clash ids, newest relationship first. */
export async function fetchFollowedClashIds(
  account: string,
  active: () => boolean = () => true,
): Promise<string[]> {
  const { data, error } = await callRpc('followed_clash_ids', {});
  if (error) throw requestError(error);
  await guard(account, active);
  const rows: unknown[] = Array.isArray(data) ? data : [];
  return rows
    .map((row) => (row as { clash_id?: unknown }).clash_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}
