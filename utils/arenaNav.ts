/**
 * Arena primary navigation vocabulary (UI/IA only).
 * Arena = For You / Clashes / Community / Topics / Trending.
 */

export type ArenaMode =
  | 'for_you'
  | 'clashes'
  | 'community'
  | 'topics'
  | 'trending';

export const ARENA_MODES: readonly { id: ArenaMode; label: string }[] = [
  { id: 'for_you', label: 'FOR YOU' },
  { id: 'clashes', label: 'CLASHES' },
  { id: 'community', label: 'COMMUNITY' },
  { id: 'topics', label: 'TOPICS' },
  { id: 'trending', label: 'TRENDING' },
] as const;

export const DEFAULT_ARENA_MODE: ArenaMode = 'for_you';

/** Icon-first rail; labels expand on press (ExploreModeRail pattern). */
export const ARENA_MODE_ICONS: Record<ArenaMode, string> = {
  for_you: 'spark',
  clashes: 'swords',
  community: 'users',
  topics: 'hash',
  trending: 'trend',
};

export function arenaModeAccessibilityLabel(
  label: string,
  selected: boolean,
): string {
  return selected ? `${label}, selected` : label;
}

export function isArenaMode(value: string): value is ArenaMode {
  return ARENA_MODES.some((m) => m.id === value);
}
