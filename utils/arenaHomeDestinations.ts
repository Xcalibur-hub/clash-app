/**
 * Home navigation destinations for UI-2A.
 * Primary Home modes stay on the tab. Groups and Discover keep dedicated routes.
 */

import type { ArenaMode } from './arenaNav';

export type ArenaHomePrimaryMode = 'for_you' | 'clashes';

export const ARENA_HOME_PRIMARY_MODES: readonly { id: ArenaHomePrimaryMode; label: string }[] = [
  { id: 'for_you', label: 'For You' },
  { id: 'clashes', label: 'Live' },
] as const;

export const ARENA_HOME_ROUTE_DESTINATIONS: readonly {
  id: 'community' | 'topics';
  label: string;
  route: '/arena/crews' | '/arena/topics';
}[] = [
  { id: 'community', label: 'Groups', route: '/arena/crews' },
  { id: 'topics', label: 'Discover', route: '/arena/topics' },
] as const;

export type ArenaNavResolved =
  | { kind: 'home_mode'; mode: ArenaHomePrimaryMode }
  | { kind: 'route'; route: '/arena/crews' | '/arena/topics' };

/** Explicit old Home chip / mode → new destination. */
export const ARENA_NAV_DESTINATION_MAP = {
  for_you: { kind: 'home_mode', mode: 'for_you' },
  clashes: { kind: 'home_mode', mode: 'clashes' },
  community: { kind: 'route', route: '/arena/crews' },
  topics: { kind: 'route', route: '/arena/topics' },
} as const satisfies Record<ArenaMode, ArenaNavResolved>;

export function isArenaHomePrimaryMode(value: string): value is ArenaHomePrimaryMode {
  return ARENA_HOME_PRIMARY_MODES.some((item) => item.id === value);
}

export function resolveArenaNavDestination(value: string): ArenaNavResolved | null {
  if (!(value in ARENA_NAV_DESTINATION_MAP)) return null;
  return ARENA_NAV_DESTINATION_MAP[value as ArenaMode];
}

let lastHomePrimaryMode: ArenaHomePrimaryMode = 'for_you';

/** In-memory only — never persist across process death. */
export function rememberArenaHomePrimaryMode(mode: ArenaHomePrimaryMode): void {
  lastHomePrimaryMode = mode;
}

export function recalledArenaHomePrimaryMode(): ArenaHomePrimaryMode {
  return lastHomePrimaryMode;
}

export function resetArenaHomePrimaryModeMemory(): void {
  lastHomePrimaryMode = 'for_you';
}
