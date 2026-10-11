/**
 * Pure Arena Crew RPC payload parsers — shared by the client service + unit tests.
 * Keep field names aligned with public.arena_crew_payload().
 */
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

export function parseArenaCrewPayload(row: unknown): ArenaCrew | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.slug !== 'string' || typeof r.name !== 'string') {
    return null;
  }
  const viewerRaw = (r.viewer && typeof r.viewer === 'object' ? r.viewer : {}) as Record<
    string,
    unknown
  >;
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
        role === 'OWNER' || role === 'MODERATOR' || role === 'MEMBER' ? role : null,
      isFollowing: Boolean(viewerRaw.isFollowing),
    },
  };
}

export function parseArenaCrewList(data: unknown): ArenaCrew[] {
  if (!Array.isArray(data)) return [];
  return data.map(parseArenaCrewPayload).filter((c): c is ArenaCrew => c !== null);
}

/** Maps known Crew RPC error messages to stable keys for callers/tests. */
export function arenaCrewErrorKey(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('sign in')) return 'auth_required';
  if (m.includes('already in a crew')) return 'already_in_crew';
  if (m.includes('crew rejoin cooldown')) return 'cooldown';
  if (m.includes('crew slug is taken')) return 'slug_taken';
  if (m.includes('not open join')) return 'not_open_join';
  if (m.includes('transfer ownership')) return 'owner_must_transfer';
  if (m.includes('not a member')) return 'not_a_member';
  if (m.includes('invite expired') || m === 'expired') return 'invite_expired';
  if (m.includes('only owners and moderators') || m.includes('not your invite')) {
    return 'permission_denied';
  }
  if (m.includes('request already pending')) return 'request_already_pending';
  if (m.includes('invite already pending')) return 'invite_already_pending';
  if (m.includes('rate') || m.includes('too many') || m.includes('throttl')) {
    return 'rate_limited';
  }
  return 'unknown';
}

/** User-facing copy for Crew RPC failures — never expose raw SQL text. */
export function arenaCrewUserMessage(message: string): string {
  switch (arenaCrewErrorKey(message)) {
    case 'auth_required':
      return 'Sign in to continue with Crews.';
    case 'already_in_crew':
      return 'You can only be in one Crew at a time. Leave your current Crew first.';
    case 'cooldown':
      return 'You recently left a Crew. Try again after the rejoin cooldown.';
    case 'slug_taken':
      return 'That Crew URL is already taken. Try another slug.';
    case 'not_open_join':
      return 'This Crew is not open join. Request access or wait for an invite.';
    case 'owner_must_transfer':
      return 'Transfer ownership before leaving as the only owner.';
    case 'not_a_member':
      return 'You are not a member of this Crew.';
    case 'invite_expired':
      return 'That invite has expired.';
    case 'permission_denied':
      return 'You do not have permission for that action.';
    case 'request_already_pending':
      return 'Your join request is already pending.';
    case 'invite_already_pending':
      return 'An invite is already pending for that person.';
    case 'rate_limited':
      return 'Too many Crew actions. Wait a bit and try again.';
    default:
      return 'Something went wrong with that Crew action. Try again.';
  }
}
