/**
 * Arena Crews — Phase A client shell.
 * Membership/create/join/leave/follow/invite/request via SECURITY DEFINER RPCs.
 * No client writes; no invented reputation.
 */
import {
  parseArenaCrewList,
  parseArenaCrewPayload,
  type ArenaCrew,
  type ArenaCrewJoinMode,
} from '../utils/arenaCrewPayload';
import { requestError, requireSupabase } from './supabaseClient';

export type { ArenaCrew, ArenaCrewJoinMode, ArenaCrewMemberRole, ArenaCrewViewer } from '../utils/arenaCrewPayload';

type RpcResult = { data: unknown; error: { message: string; code?: string; details?: string; hint?: string; name?: string } | null };

async function crewRpc(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await (
    requireSupabase() as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => Promise<RpcResult>;
    }
  ).rpc(name, args);
  if (error) throw requestError(error as import('@supabase/supabase-js').PostgrestError);
  return data;
}

export async function createArenaCrew(input: {
  name: string;
  slug: string;
  bio?: string;
  joinMode?: ArenaCrewJoinMode;
  specialties?: string[];
}): Promise<ArenaCrew> {
  const data = await crewRpc('create_arena_crew', {
    p_name: input.name,
    p_slug: input.slug,
    p_bio: input.bio ?? '',
    p_join_mode: input.joinMode ?? 'OPEN',
    p_specialties: input.specialties ?? [],
  });
  const crew = parseArenaCrewPayload(data);
  if (!crew) throw new Error('create_arena_crew returned unexpected payload');
  return crew;
}

export async function joinArenaCrew(crewId: string): Promise<ArenaCrew> {
  const crew = parseArenaCrewPayload(await crewRpc('join_arena_crew', { p_crew_id: crewId }));
  if (!crew) throw new Error('join_arena_crew returned unexpected payload');
  return crew;
}

export async function leaveArenaCrew(crewId: string): Promise<ArenaCrew> {
  const crew = parseArenaCrewPayload(await crewRpc('leave_arena_crew', { p_crew_id: crewId }));
  if (!crew) throw new Error('leave_arena_crew returned unexpected payload');
  return crew;
}

export async function followArenaCrew(crewId: string): Promise<ArenaCrew> {
  const crew = parseArenaCrewPayload(await crewRpc('follow_arena_crew', { p_crew_id: crewId }));
  if (!crew) throw new Error('follow_arena_crew returned unexpected payload');
  return crew;
}

export async function unfollowArenaCrew(crewId: string): Promise<ArenaCrew> {
  const crew = parseArenaCrewPayload(await crewRpc('unfollow_arena_crew', { p_crew_id: crewId }));
  if (!crew) throw new Error('unfollow_arena_crew returned unexpected payload');
  return crew;
}

export async function inviteToArenaCrew(crewId: string, recipientId: string): Promise<{ id: string; status: string }> {
  const data = (await crewRpc('invite_to_arena_crew', {
    p_crew_id: crewId,
    p_recipient_id: recipientId,
  })) as { id?: string; status?: string } | null;
  return { id: String(data?.id ?? ''), status: String(data?.status ?? '') };
}

export async function respondArenaCrewInvite(inviteId: string, accept: boolean): Promise<ArenaCrew | { id: string; status: string }> {
  const data = await crewRpc('respond_arena_crew_invite', {
    p_invite_id: inviteId,
    p_accept: accept,
  });
  const crew = parseArenaCrewPayload(data);
  if (crew) return crew;
  const row = data as { id?: string; status?: string } | null;
  return { id: String(row?.id ?? ''), status: String(row?.status ?? '') };
}

export async function requestArenaCrewJoin(crewId: string): Promise<{ id: string; status: string }> {
  const data = (await crewRpc('request_arena_crew_join', { p_crew_id: crewId })) as {
    id?: string;
    status?: string;
  } | null;
  return { id: String(data?.id ?? ''), status: String(data?.status ?? '') };
}

export async function decideArenaCrewJoinRequest(
  requestId: string,
  approve: boolean,
): Promise<ArenaCrew | { id: string; status: string }> {
  const data = await crewRpc('decide_arena_crew_join_request', {
    p_request_id: requestId,
    p_approve: approve,
  });
  const crew = parseArenaCrewPayload(data);
  if (crew) return crew;
  const row = data as { id?: string; status?: string } | null;
  return { id: String(row?.id ?? ''), status: String(row?.status ?? '') };
}

export async function getArenaCrew(slug: string): Promise<ArenaCrew | null> {
  return parseArenaCrewPayload(await crewRpc('get_arena_crew', { p_slug: slug }));
}

export async function listArenaCrews(opts?: {
  limit?: number;
  offset?: number;
  specialty?: string | null;
}): Promise<ArenaCrew[]> {
  return parseArenaCrewList(
    await crewRpc('list_arena_crews', {
      p_limit: opts?.limit ?? 24,
      p_offset: opts?.offset ?? 0,
      p_specialty: opts?.specialty ?? null,
    }),
  );
}

export async function listMyArenaCrews(): Promise<ArenaCrew[]> {
  return parseArenaCrewList(await crewRpc('list_my_arena_crews'));
}

export { ARENA_CREW_SPECIALTIES } from '../utils/arenaCrewSpecialties';
