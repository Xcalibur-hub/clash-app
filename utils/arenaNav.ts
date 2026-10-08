/**
 * Arena primary navigation vocabulary (UI/IA only).
 * Four destinations within the existing Arena screen.
 */

export type ArenaMode =
  | 'for_you'
  | 'clashes'
  | 'community'
  | 'topics';

export const ARENA_MODES: readonly { id: ArenaMode; label: string }[] = [
  { id: 'for_you', label: 'Home' },
  { id: 'clashes', label: 'Live Clashes' },
  { id: 'community', label: 'Communities' },
  { id: 'topics', label: 'Topics & Trends' },
] as const;

export const DEFAULT_ARENA_MODE: ArenaMode = 'for_you';

/** Icons accompanying the persistent destination labels. */
export const ARENA_MODE_ICONS: Record<ArenaMode, string> = {
  for_you: 'spark',
  clashes: 'swords',
  community: 'users',
  topics: 'hash',
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
