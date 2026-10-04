/**
 * Lightweight Vault home ranking — freshness + diversity, no fake popularity.
 */

export interface RankableVaultItem {
  id: string;
  creatorId: string;
  /** Higher is fresher / more relevant. */
  score: number;
}

/** Prefer fresher items while avoiding one creator dominating the shelf. */
export function diversifyVaultByCreator<T extends RankableVaultItem>(
  items: readonly T[],
  max = 24,
): T[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const out: T[] = [];
  const deferred: T[] = [];
  let lastCreator: string | null = null;

  for (const item of sorted) {
    if (item.creatorId && item.creatorId === lastCreator) {
      deferred.push(item);
      continue;
    }
    out.push(item);
    lastCreator = item.creatorId;
    if (out.length >= max) return out;
  }

  for (const item of deferred) {
    if (out.length >= max) break;
    if (item.creatorId && out[out.length - 1]?.creatorId === item.creatorId) continue;
    out.push(item);
    lastCreator = item.creatorId;
  }

  return out;
}

export function vaultFreshnessScore(publishedAt: number | null | undefined, now = Date.now()): number {
  if (!publishedAt) return 0;
  const ageHours = Math.max(0, (now - publishedAt) / 3_600_000);
  return Math.max(0, 168 - ageHours);
}
