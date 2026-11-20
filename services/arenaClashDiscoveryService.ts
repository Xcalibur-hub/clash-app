import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../supabase/database.types';
import { requireSupabase, requestError } from './supabaseClient';
import { parseClashDiscovery, type ClashDiscoveryEntry } from '../utils/arenaClashDiscovery';
// Additive RPC typing until the generated schema is refreshed with the migration.
type DiscoveryDatabase = Omit<Database, 'public'> & { public: Omit<Database['public'], 'Functions'> & {
  Functions: Database['public']['Functions'] & { list_arena_clash_discovery: { Args: Record<string, never>; Returns: Json } };
} };
export async function fetchClashDiscovery(): Promise<ClashDiscoveryEntry[]> {
  const client = requireSupabase() as unknown as SupabaseClient<DiscoveryDatabase>;
  const { data, error } = await client.rpc('list_arena_clash_discovery', {});
  if (error) throw requestError(error);
  return parseClashDiscovery(data);
}
