/**
 * Deterministic community pseudonyms (Phase 15.2).
 *
 * Mirrors `public.vault_community_seed` / `public.vault_community_alias` exactly
 * (a 32-bit FNV-1a hash over `<community>:<profile>`), so the client can preview
 * the same alias the server stores while the server remains the only authority.
 *
 * An alias is SCOPED to one community: the same profile always derives the same
 * alias there, and a different community derives independently. It never
 * reveals the source profile id, and it is never randomized per render.
 */

/** Word banks — the same order as the SQL function (order is part of the result). */
export const COMMUNITY_ADJECTIVES = [
  'Night',
  'Quiet',
  'Silver',
  'Amber',
  'Velvet',
  'Copper',
  'Indigo',
  'Hollow',
  'Ember',
  'Pale',
] as const;

export const COMMUNITY_NOUNS = [
  'Owl',
  'Pixel',
  'Fox',
  'Wren',
  'Harbor',
  'Lantern',
  'Sparrow',
  'Kite',
  'Cinder',
  'Marlow',
] as const;

/** 32-bit FNV-1a. Identical result to the SQL `vault_community_seed`. */
export function communitySeed(communityId: string, profileId: string): number {
  const input = `${communityId}:${profileId}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Stable, community-scoped alias such as "Night Owl 27". */
export function deriveCommunityAlias(communityId: string, profileId: string): string {
  const hash = communitySeed(communityId, profileId);
  const adjective = hash % COMMUNITY_ADJECTIVES.length;
  const noun =
    Math.floor(hash / COMMUNITY_ADJECTIVES.length) % COMMUNITY_NOUNS.length;
  const number =
    Math.floor(hash / (COMMUNITY_ADJECTIVES.length * COMMUNITY_NOUNS.length)) % 90 + 10;
  return `${COMMUNITY_ADJECTIVES[adjective]} ${COMMUNITY_NOUNS[noun]} ${number}`;
}

/** The identity a card carries — real, or pseudonymous (no handle / profile id). */
export interface CommunityIdentity {
  name: string;
  handle: string | null;
  profileId: string | null;
  tint: string;
  pseudonymous: boolean;
}

export interface CommunityIdentityPresentation {
  label: string;
  handle: string | null;
  initials: string;
  pseudonymous: boolean;
  /** True only when tapping the identity may open a real profile. */
  canOpenProfile: boolean;
}

function initialsOf(label: string): string {
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

/**
 * Presentation-only. A pseudonymous identity never exposes a handle, a profile
 * id, or a tappable profile link — only its public alias and initials.
 */
export function communityIdentityPresentation(
  identity: CommunityIdentity,
): CommunityIdentityPresentation {
  const label = identity.name.trim() || 'Member';
  const handle = identity.pseudonymous ? null : identity.handle;
  return {
    label,
    handle,
    initials: initialsOf(label),
    pseudonymous: identity.pseudonymous,
    canOpenProfile: !identity.pseudonymous && identity.profileId !== null,
  };
}
