/**
 * Deterministic Crew visual identity — crest accents + initials.
 * Pure helpers with no local runtime imports so Node unit tests stay freestanding.
 */
export type ArenaCrewJoinMode = 'OPEN' | 'REQUEST' | 'INVITE_ONLY';
export type CrewAccentKey = 'coral' | 'amber' | 'blue' | 'violet' | 'teal' | 'rose';

const SPECIALTY_ACCENT: Record<string, CrewAccentKey> = {
  Tech: 'blue',
  Gaming: 'coral',
  Politics: 'amber',
  Sports: 'teal',
  Finance: 'amber',
  Science: 'teal',
  Movies: 'violet',
  Music: 'rose',
  Culture: 'violet',
  Cars: 'coral',
  History: 'amber',
  Design: 'blue',
  General: 'teal',
};

const KEYS: readonly CrewAccentKey[] = ['coral', 'amber', 'blue', 'violet', 'teal', 'rose'];

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function crestInitials(value: string): string {
  const clean = value.replace(/^@/, '').trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return 'C';
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

/** Stable accent key from specialty preference, else hash of crew id/slug. */
export function crewAccentKeyFor(input: {
  id: string;
  slug?: string;
  specialties?: readonly string[];
}): CrewAccentKey {
  const preferred = input.specialties?.find((s) => s in SPECIALTY_ACCENT);
  if (preferred) return SPECIALTY_ACCENT[preferred]!;
  return KEYS[hashString(input.slug || input.id) % KEYS.length]!;
}

/** One initial for a single word; two initials for a multiword Crew name. */
export function crewCrestInitials(name: string): string {
  return crestInitials(name);
}

/** Join CTA label for the stronger membership action. */
export function crewJoinLabel(
  joinMode: ArenaCrewJoinMode,
  viewer: { isMember: boolean; hasPendingRequest: boolean; activeCrewId: string | null },
  crewId: string,
): string {
  if (viewer.isMember) return 'YOUR CREW';
  if (viewer.hasPendingRequest) return 'REQUESTED';
  if (viewer.activeCrewId && viewer.activeCrewId !== crewId) return 'ONE CREW ONLY';
  if (joinMode === 'OPEN') return 'JOIN CREW';
  if (joinMode === 'REQUEST') return 'REQUEST TO JOIN';
  return 'INVITE ONLY';
}

export type CrewJoinAction = 'join' | 'request' | 'blocked_other' | 'pending' | 'member' | 'invite_only';

export function crewJoinAction(
  joinMode: ArenaCrewJoinMode,
  viewer: { isMember: boolean; hasPendingRequest: boolean; activeCrewId: string | null },
  crewId: string,
): CrewJoinAction {
  if (viewer.isMember) return 'member';
  if (viewer.hasPendingRequest) return 'pending';
  if (viewer.activeCrewId && viewer.activeCrewId !== crewId) return 'blocked_other';
  if (joinMode === 'OPEN') return 'join';
  if (joinMode === 'REQUEST') return 'request';
  return 'invite_only';
}

export function crewJoinModeLabel(joinMode: ArenaCrewJoinMode): string {
  if (joinMode === 'OPEN') return 'Open Crew';
  if (joinMode === 'REQUEST') return 'Request to join';
  return 'Invite only';
}

/** Social status chips — never enterprise analytics language. */
export function crewStatusChips(crew: {
  memberCount: number;
  wins: number;
  losses: number;
  streak: number;
  specialties: readonly string[];
  joinMode: ArenaCrewJoinMode;
}): string[] {
  const chips: string[] = [];
  const specialty = crew.specialties[0];
  if (specialty) chips.push(specialty);
  chips.push(crewJoinModeLabel(crew.joinMode));
  if (crew.wins > 0) chips.push(`${crew.wins} win${crew.wins === 1 ? '' : 's'}`);
  if (crew.streak >= 2) chips.push(`${crew.streak}-win streak`);
  return chips.slice(0, 4);
}

export function formatCrewMembers(count: number): string {
  if (count < 1000) return `${count} member${count === 1 ? '' : 's'}`;
  const k = count / 1000;
  return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}K members`;
}

/** Slugify a Crew name for the create form. */
export function suggestCrewSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}
