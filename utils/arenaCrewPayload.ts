/**
 * Pure Arena Crew RPC payload parsers — shared by the client service + unit tests.
 * Keep field names aligned with public.arena_crew_payload().
 */
export type ArenaCrewJoinMode = 'OPEN' | 'REQUEST' | 'INVITE_ONLY';
export type ArenaCrewMemberRole = 'OWNER' | 'MODERATOR' | 'MEMBER';
export type ArenaCrewDiscoverSort = 'popular' | 'rising' | 'recent';

export interface ArenaCrewViewer {
  isMember: boolean;
  role: ArenaCrewMemberRole | null;
  isFollowing: boolean;
  hasPendingRequest: boolean;
  activeCrewId: string | null;
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

export interface ArenaCrewMember {
  profileId: string;
  name: string;
  handle: string;
  tint: string;
  role: ArenaCrewMemberRole;
  joinedAt: string;
}

export interface ArenaCrewDiscoverPage {
  items: ArenaCrew[];
  nextCursor: string | null;
  sort: ArenaCrewDiscoverSort;
}

function parseViewer(raw: unknown): ArenaCrewViewer {
  const viewerRaw = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const role = viewerRaw.role;
  return {
    isMember: Boolean(viewerRaw.isMember),
    role: role === 'OWNER' || role === 'MODERATOR' || role === 'MEMBER' ? role : null,
    isFollowing: Boolean(viewerRaw.isFollowing),
    hasPendingRequest: Boolean(viewerRaw.hasPendingRequest),
    activeCrewId: typeof viewerRaw.activeCrewId === 'string' ? viewerRaw.activeCrewId : null,
  };
}

export function parseArenaCrewPayload(row: unknown): ArenaCrew | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.slug !== 'string' || typeof r.name !== 'string') {
    return null;
  }
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
    viewer: parseViewer(r.viewer),
  };
}

export function parseArenaCrewList(data: unknown): ArenaCrew[] {
  if (!Array.isArray(data)) return [];
  return data.map(parseArenaCrewPayload).filter((c): c is ArenaCrew => c !== null);
}

export function parseArenaCrewDiscoverPage(data: unknown): ArenaCrewDiscoverPage {
  if (!data || typeof data !== 'object') {
    return { items: [], nextCursor: null, sort: 'popular' };
  }
  const r = data as Record<string, unknown>;
  const sort = r.sort === 'rising' || r.sort === 'recent' || r.sort === 'popular' ? r.sort : 'popular';
  return {
    items: parseArenaCrewList(r.items),
    nextCursor: typeof r.nextCursor === 'string' ? r.nextCursor : null,
    sort,
  };
}

export function parseArenaCrewMember(row: unknown): ArenaCrewMember | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.profileId !== 'string' || typeof r.handle !== 'string') return null;
  const role = r.role;
  return {
    profileId: r.profileId,
    name: String(r.name ?? r.handle),
    handle: r.handle,
    tint: typeof r.tint === 'string' && /^#[0-9A-Fa-f]{6}$/.test(r.tint) ? r.tint : '#A1A1AA',
    role: role === 'OWNER' || role === 'MODERATOR' || role === 'MEMBER' ? role : 'MEMBER',
    joinedAt: String(r.joinedAt ?? ''),
  };
}

export function parseArenaCrewMembers(data: unknown): ArenaCrewMember[] {
  if (!Array.isArray(data)) return [];
  return data.map(parseArenaCrewMember).filter((m): m is ArenaCrewMember => m !== null);
}

/** Maps known Crew RPC error messages to stable keys for callers/tests. */
export function arenaCrewErrorKey(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already in a crew')) return 'already_in_crew';
  if (m.includes('crew rejoin cooldown')) return 'cooldown';
  if (m.includes('crew slug is taken')) return 'slug_taken';
  if (m.includes('invite expired') || m === 'expired') return 'invite_expired';
  if (m.includes('only owners and moderators') || m.includes('not your invite')) {
    return 'permission_denied';
  }
  if (m.includes('request already pending')) return 'request_already_pending';
  if (m.includes('invite already pending')) return 'invite_already_pending';
  return 'unknown';
}
