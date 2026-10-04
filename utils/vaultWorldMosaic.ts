/**
 * Vault Discover world mosaic packing — same editorial rhythm as Explore For You.
 * Deterministic; never random.
 */

export type VaultWorldMosaicRow<T> =
  | { key: string; type: 'feature'; large: T; smallTop: T; smallBottom: T }
  | { key: string; type: 'pair'; left: T; right: T }
  | { key: string; type: 'single'; item: T };

/**
 * large + two stacked small → two portraits → wide single → repeat.
 * Falls back gracefully for short tails (pair before single).
 */
export function packVaultWorldMosaicRows<T extends { id: string }>(
  items: readonly T[],
): VaultWorldMosaicRow<T>[] {
  const rows: VaultWorldMosaicRow<T>[] = [];
  let i = 0;
  let phase: 'feature' | 'pair' | 'single' = 'feature';

  while (i < items.length) {
    const remaining = items.length - i;

    if (phase === 'feature') {
      if (remaining >= 3) {
        const large = items[i]!;
        const smallTop = items[i + 1]!;
        const smallBottom = items[i + 2]!;
        rows.push({
          key: `feature:${large.id}`,
          type: 'feature',
          large,
          smallTop,
          smallBottom,
        });
        i += 3;
        phase = 'pair';
        continue;
      }
      // Not enough for feature — prefer a pair over two singles.
      if (remaining >= 2) {
        const left = items[i]!;
        const right = items[i + 1]!;
        rows.push({
          key: `pair:${left.id}:${right.id}`,
          type: 'pair',
          left,
          right,
        });
        i += 2;
        phase = 'single';
        continue;
      }
    }

    if ((phase === 'pair' || phase === 'feature') && remaining >= 2) {
      const left = items[i]!;
      const right = items[i + 1]!;
      rows.push({
        key: `pair:${left.id}:${right.id}`,
        type: 'pair',
        left,
        right,
      });
      i += 2;
      phase = 'single';
      continue;
    }

    const item = items[i]!;
    rows.push({ key: `single:${item.id}`, type: 'single', item });
    i += 1;
    phase = phase === 'single' ? 'feature' : 'pair';
  }

  return rows;
}
