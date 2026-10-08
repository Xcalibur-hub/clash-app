import { requestError, requireSupabase, currentUserId, SupabaseError } from './supabaseClient';
import { parseArenaChallenge, type ArenaChallenge } from '../utils/arenaChallengePayload';
import { parseChallengeInbox, type InboxDirection } from '../utils/challengeInbox';
async function timed<T>(request: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try { return await request(controller.signal); } finally { clearTimeout(timeout); }
}
export async function createArenaChallenge(takeId: string, counterPosition: string): Promise<ArenaChallenge> {
  const { data, error } = await requireSupabase().rpc('create_arena_challenge', {
    p_take_id: takeId, p_counter_position: counterPosition,
  });
  if (error) throw requestError(error);
  return parseArenaChallenge(data);
}
export async function resolveArenaChallenge(id: string, action: 'ACCEPT' | 'PASS' | 'CANCEL', expectedAccountId?: string): Promise<ArenaChallenge> {
  const account = expectedAccountId ?? await currentUserId();
  if (!account || await currentUserId() !== account) throw new SupabaseError('Account changed', 'account_changed');
  const { data, error } = await timed(signal => requireSupabase().rpc('resolve_arena_challenge', { p_challenge_id: id, p_action: action }).abortSignal(signal));
  if (error) throw requestError(error);
  if (await currentUserId() !== account) throw new SupabaseError('Account changed', 'account_changed');
  return parseArenaChallenge(data);
}

export async function fetchChallengeInbox(direction: InboxDirection, expectedAccountId: string, before?: ArenaChallenge) {
  if (await currentUserId() !== expectedAccountId) throw new SupabaseError('Account changed', 'account_changed');
  // Additive RPC typing; retain the generated schema until it can be regenerated safely.
  const client = requireSupabase() as unknown as { rpc: (name: string, args: Record<string, unknown>) => {abortSignal:(signal:AbortSignal)=>PromiseLike<{data: unknown;error: import('@supabase/supabase-js').PostgrestError | null}>} };
  const {data,error} = await timed(signal => client.rpc('list_my_arena_challenges', {
    p_direction: direction, p_limit: 20,
    ...(before ? {p_before_created_at:before.createdAt,p_before_id:before.id} : {}),
  }).abortSignal(signal));
  if (error) throw requestError(error);
  if (await currentUserId() !== expectedAccountId) throw new SupabaseError('Account changed', 'account_changed');
  return parseChallengeInbox(data,direction);
}
export async function listArenaChallenges(takeId: string, before?: ArenaChallenge): Promise<ArenaChallenge[]> {
  const { data, error } = await requireSupabase().rpc('list_arena_challenges', {
    p_take_id: takeId, p_limit: 20,
    ...(before ? { p_before_created_at: before.createdAt, p_before_id: before.id } : {}),
  });
  if (error) throw requestError(error);
  if (!Array.isArray(data)) throw new Error('Invalid Challenge page');
  return data.map(parseArenaChallenge);
}
