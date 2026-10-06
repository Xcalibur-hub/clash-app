/**
 * Arena Crews — Phase A client shell.
 * Membership/create/join/leave/follow/invite/request via SECURITY DEFINER RPCs.
 * No client writes; no invented reputation.
 */
import { requestError, requireSupabase } from './supabaseClient';

export type ArenaCrewJoinMode = 'OPEN' | 'REQUEST' | 'INVITE_ONLY';
export type ArenaCrewMemberRole = 'OWNER' | 'MODERATOR' | 'MEMBER';

export interface ArenaCrewViewer {
  isMember: boolean;
  role: ArenaCrewMemberRole | null;
  isFollowing: boolean;
}

export interface ArenaCrew {
  id: string;
  slug: string;
  name: string;
  bio: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  specialties: string[];
  joinMode: ArenaCrewJoinMode;
  memberCount: number;
  followerCount: number;
  totalReputation: number;
  seasonalRating: number;
  wins: number;
  losses: number;
  streak: number;
  createdAt: string;
  viewer: ArenaCrewViewer;
}

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

function asCrew(row: unknown): ArenaCrew | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.slug !== 'string' || typeof r.name !== 'string') return null;
  const viewerRaw = (r.viewer && typeof r.viewer === 'object' ? r.viewer : {}) as Record<string, unknown>;
  const role = viewerRaw.role;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    bio: String(r.bio ?? ''),
    avatarUrl: typeof r.avatarUrl === 'string' ? r.avatarUrl : null,
    bannerUrl: typeof r.bannerUrl === 'string' ? r.bannerUrl : null,
    specialties: Array.isArray(r.specialties) ? r.specialties.map(String) : [],
    joinMode: (r.joinMode as ArenaCrewJoinMode) ?? 'OPEN',
    memberCount: Number(r.memberCount) || 0,
    followerCount: Number(r.followerCount) || 0,
    totalReputation: Number(r.totalReputation) || 0,
    seasonalRating: Number(r.seasonalRating) || 1000,
    wins: Number(r.wins) || 0,
    losses: Number(r.losses) || 0,
    streak: Number(r.streak) || 0,
    createdAt: String(r.createdAt ?? ''),
    viewer: {
      isMember: Boolean(viewerRaw.isMember),
      role:
        role === 'OWNER' || role === 'MODERATOR' || role === 'MEMBER'
          ? role
          : null,
      isFollowing: Boolean(viewerRaw.isFollowing),
    },
  };
}

function asCrewList(data: unknown): ArenaCrew[] {
  if (!Array.isArray(data)) return [];
  return data.map(asCrew).filter((c): c is ArenaCrew => c !== null);
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
  const crew = asCrew(data);
  if (!crew) throw new Error('create_arena_crew returned unexpected payload');
  return crew;
}

export async function joinArenaCrew(crewId: string): Promise<ArenaCrew> {
  const crew = asCrew(await crewRpc('join_arena_crew', { p_crew_id: crewId }));
  if (!crew) throw new Error('join_arena_crew returned unexpected payload');
  return crew;
}

export async function leaveArenaCrew(crewId: string): Promise<ArenaCrew> {
  const crew = asCrew(await crewRpc('leave_arena_crew', { p_crew_id: crewId }));
  if (!crew) throw new Error('leave_arena_crew returned unexpected payload');
  return crew;
}

export async function followArenaCrew(crewId: string): Promise<ArenaCrew> {
  const crew = asCrew(await crewRpc('follow_arena_crew', { p_crew_id: crewId }));
  if (!crew) throw new Error('follow_arena_crew returned unexpected payload');
  return crew;
}

export async function unfollowArenaCrew(crewId: string): Promise<ArenaCrew> {
  const crew = asCrew(await crewRpc('unfollow_arena_crew', { p_crew_id: crewId }));
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
  const crew = asCrew(data);
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
  const crew = asCrew(data);
  if (crew) return crew;
  const row = data as { id?: string; status?: string } | null;
  return { id: String(row?.id ?? ''), status: String(row?.status ?? '') };
}

export async function getArenaCrew(slug: string): Promise<ArenaCrew | null> {
  return asCrew(await crewRpc('get_arena_crew', { p_slug: slug }));
}

export async function listArenaCrews(opts?: {
  limit?: number;
  offset?: number;
  specialty?: string | null;
}): Promise<ArenaCrew[]> {
  return asCrewList(
    await crewRpc('list_arena_crews', {
      p_limit: opts?.limit ?? 24,
      p_offset: opts?.offset ?? 0,
      p_specialty: opts?.specialty ?? null,
    }),
  );
}

export async function listMyArenaCrews(): Promise<ArenaCrew[]> {
  return asCrewList(await crewRpc('list_my_arena_crews'));
}

export { ARENA_CREW_SPECIALTIES } from '../utils/arenaCrewSpecialties';
