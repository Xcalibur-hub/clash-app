/**
 * Explore navigation + For You filter vocabulary (UI/IA only).
 */

import type { ExploreMode } from './exploreForYouRank';

export type ForYouFilterId =
  | 'all'
  | 'trending'
  | 'arena'
  | 'vault'
  | 'video'
  | 'challenges';

export const FOR_YOU_FILTERS: readonly { id: ForYouFilterId; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'trending', label: 'TRENDING' },
  { id: 'arena', label: 'ARENA' },
  { id: 'vault', label: 'VAULT' },
  { id: 'video', label: 'VIDEO' },
  { id: 'challenges', label: 'CHALLENGES' },
] as const;

export const DEFAULT_FOR_YOU_FILTER: ForYouFilterId = 'all';

export function exploreModeAccessibilityLabel(
  label: string,
  selected: boolean,
): string {
  return selected ? `${label}, selected` : label;
}

export function forYouFilterAccessibilityLabel(
  label: string,
  selected: boolean,
): string {
  return selected ? `Filter ${label}, selected` : `Filter ${label}`;
}

/** Primary Explore modes stay icon-first; labels expand on the floating rail. */
export const EXPLORE_MODE_ICONS: Record<ExploreMode, string> = {
  for_you: 'spark',
  world: 'globe',
  live: 'zap',
  play: 'play',
  meet: 'meet',
};

export type ExploreMosaicRow<T> =
  | { key: string; type: 'feature'; large: T; smallTop: T; smallBottom: T }
  | { key: string; type: 'pair'; left: T; right: T }
  | { key: string; type: 'single'; item: T };

/**
 * Repeatable editorial rhythm:
 * large + two stacked small → two portraits → repeat.
 * Deterministic — never random.
 */
export function packExploreMosaicRows<T extends { id: string; kind: string }>(
  items: readonly T[],
): ExploreMosaicRow<T>[] {
  const rows: ExploreMosaicRow<T>[] = [];
  let i = 0;
  let featureTurn = true;

  while (i < items.length) {
    if (featureTurn && i + 2 < items.length) {
      const large = items[i]!;
      const smallTop = items[i + 1]!;
      const smallBottom = items[i + 2]!;
      rows.push({
        key: `feature:${large.kind}:${large.id}`,
        type: 'feature',
        large,
        smallTop,
        smallBottom,
      });
      i += 3;
      featureTurn = false;
      continue;
    }

    if (i + 1 < items.length) {
      const left = items[i]!;
      const right = items[i + 1]!;
      rows.push({
        key: `pair:${left.kind}:${left.id}`,
        type: 'pair',
        left,
        right,
      });
      i += 2;
      featureTurn = true;
      continue;
    }

    const item = items[i]!;
    rows.push({
      key: `single:${item.kind}:${item.id}`,
      type: 'single',
      item,
    });
    i += 1;
    featureTurn = true;
  }

  return rows;
}

/** True when secondary filter label would duplicate the primary For You mode. */
export function isDuplicateForYouFilterLabel(label: string): boolean {
  return label.trim().toLowerCase() === 'for you';
}
