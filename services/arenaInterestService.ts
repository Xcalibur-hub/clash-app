import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../supabase/database.types';
import type { TableRow } from '../supabase/types';
import { requireSupabase, requestError, currentUserId, SupabaseError } from './supabaseClient';
import { toTake } from './arenaMappers';
import { parseInterestCatalogue, parseInterestPreferences } from '../utils/arenaInterests';
// Compatibility-safe additive typing; generated schema is not edited by hand.
type InterestDatabase = Omit<Database, 'public'> & { public: Omit<Database['public'], 'Functions'> & { Functions: Database['public']['Functions'] & {
  get_arena_interest_catalogue: { Args: Record<string, never>; Returns: Json };
  get_my_arena_interests: { Args: Record<string, never>; Returns: Json };
  save_my_arena_interests: { Args: { p_topic_ids: string[]; p_skip: boolean; p_expected_revision: number }; Returns: Json };
  rank_arena_for_you: { Args: { p_ids?: string[] }; Returns: Json };
} } };
function client(): SupabaseClient<InterestDatabase> { return requireSupabase() as unknown as SupabaseClient<InterestDatabase>; }
async function timed<T>(request: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try { return await request(controller.signal); } finally { clearTimeout(timer); }
}
export async function fetchInterestCatalogue() {
  const { data, error } = await timed(signal => client().rpc('get_arena_interest_catalogue', {}).abortSignal(signal));
  if (error) throw requestError(error);
  return parseInterestCatalogue(data);
}
export async function fetchMyArenaInterests() {
  const { data, error } = await timed(signal => client().rpc('get_my_arena_interests', {}).abortSignal(signal));
  if (error) throw requestError(error);
  return parseInterestPreferences(data);
}
export async function saveMyArenaInterests(topicIds: readonly string[], skip: boolean, revision: number, expectedAccountId: string) {
  if (await currentUserId() !== expectedAccountId) throw new SupabaseError('Account changed. Reopen Interests.', 'account_changed');
  const { data, error } = await timed(signal => client().rpc('save_my_arena_interests', {
    p_topic_ids: [...topicIds], p_skip: skip, p_expected_revision: revision,
  }).abortSignal(signal));
  if (error) throw requestError(error);
  if (await currentUserId() !== expectedAccountId) throw new SupabaseError('Account changed. Reopen Interests.', 'account_changed');
  return parseInterestPreferences(data);
}
export async function fetchPersonalizedArenaTakes(snapshotIds?: readonly string[]) {
  const { data, error } = await client().rpc('rank_arena_for_you', snapshotIds ? { p_ids: [...snapshotIds] } : {});
  if (error) throw requestError(error);
  if (!Array.isArray(data)) throw new Error('Invalid personalized feed');
  return data.map(row => toTake(row as unknown as TableRow<'takes'>));
}
