import { requestError, requireSupabase } from './supabaseClient';
import { parseArenaChallenge, type ArenaChallenge } from '../utils/arenaChallengePayload';
export async function createArenaChallenge(takeId: string, counterPosition: string): Promise<ArenaChallenge> {
  const { data, error } = await requireSupabase().rpc('create_arena_challenge', {
    p_take_id: takeId, p_counter_position: counterPosition,
  });
  if (error) throw requestError(error);
  return parseArenaChallenge(data);
}
export async function resolveArenaChallenge(id: string, action: 'ACCEPT' | 'PASS' | 'CANCEL'): Promise<ArenaChallenge> {
  const { data, error } = await requireSupabase().rpc('resolve_arena_challenge', { p_challenge_id: id, p_action: action });
  if (error) throw requestError(error);
  return parseArenaChallenge(data);
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
