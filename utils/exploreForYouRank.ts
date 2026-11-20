/**
 * Client-side For You diversity helpers (server does primary ranking).
 */

export interface RankableExploreItem {
  id: string;
  kind: string;
  creatorId?: string | null;
  score?: number;
}

/** Avoid consecutive items from the same creator; keep relative score order. */
export function diversifyByCreator<T extends RankableExploreItem>(
  items: readonly T[],
  max = 40,
): T[] {
  const out: T[] = [];
  const deferred: T[] = [];
  let lastCreator: string | null = null;

  for (const item of items) {
    const creator = item.creatorId ?? null;
    if (creator && creator === lastCreator) {
      deferred.push(item);
      continue;
    }
    out.push(item);
    lastCreator = creator;
    if (out.length >= max) break;
  }

  for (const item of deferred) {
    if (out.length >= max) break;
    const creator = item.creatorId ?? null;
    if (creator && out[out.length - 1]?.creatorId === creator) continue;
    out.push(item);
    lastCreator = creator;
  }

  return out;
}

export function dedupeExploreItems<T extends RankableExploreItem>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export type ExploreMode = 'for_you' | 'world' | 'live' | 'play' | 'meet';

export const EXPLORE_MODES: readonly { id: ExploreMode; label: string }[] = [
  { id: 'for_you', label: 'For You' },
  { id: 'world', label: 'World' },
  { id: 'live', label: 'Live' },
  { id: 'play', label: 'Play' },
  { id: 'meet', label: 'Meet' },
] as const;

export type ExploreSearchGroup =
  | 'top'
  | 'media'
  | 'people'
  | 'arena'
  | 'vault'
  | 'countries'
  | 'hoods';

export const EXPLORE_SEARCH_GROUPS: readonly { id: ExploreSearchGroup; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'media', label: 'Media' },
  { id: 'people', label: 'People' },
  { id: 'arena', label: 'Arena' },
  { id: 'vault', label: 'Vault' },
  { id: 'countries', label: 'Countries' },
  { id: 'hoods', label: 'Hoods' },
] as const;
