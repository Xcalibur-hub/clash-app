/**
 * Asymmetric Explore mosaic layout — Instagram-like density without cloning it.
 */

export type ExploreMosaicSpan = 'hero' | 'half' | 'wide' | 'portrait' | 'square';

export interface ExploreMosaicItemBase {
  id: string;
  kind: string;
}

const PATTERN: ExploreMosaicSpan[] = [
  'hero',
  'half',
  'half',
  'wide',
  'portrait',
  'portrait',
  'square',
  'half',
  'half',
];

export function mosaicSpanForIndex(index: number): ExploreMosaicSpan {
  return PATTERN[index % PATTERN.length] ?? 'square';
}

/** Prefer media-bearing items first so the mosaic opens visually rich. */
export function rankMosaicItems<T extends ExploreMosaicItemBase & { mediaUrl?: string | null }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    const am = a.mediaUrl ? 1 : 0;
    const bm = b.mediaUrl ? 1 : 0;
    return bm - am;
  });
}
