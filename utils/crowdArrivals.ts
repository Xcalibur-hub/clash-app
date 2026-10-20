/**
 * Crowd arrival provenance with hard-bounded seen ids and eviction tombstones.
 * Bounds are enforced after every update, including replay-only updates.
 * Tombstoned replays stay silent; genuinely new live rows still alert.
 * Limitation: ids evicted beyond the tombstone cap may replay as arrivals.
 */
export type CrowdArrivalItem = string | { id: string; origin?: 'hydrate' | 'live' | 'history' };

export interface CrowdArrivalTracker {
  observe(items: readonly CrowdArrivalItem[], options: { atLiveEdge: boolean }): boolean;
  retention(): { seen: number; evicted: number };
  reset(): void;
}

export const CROWD_MAX_SEEN = 1000;
export const CROWD_MAX_EVICTED = 500;

export function createCrowdArrivalTracker(): CrowdArrivalTracker {
  let hydrated = false;
  let order: string[] = [];
  const seen = new Set<string>();
  const evicted = new Set<string>();
  const originOf = (item: CrowdArrivalItem): string | undefined => (typeof item === 'string' ? undefined : item.origin);
  const idOf = (item: CrowdArrivalItem): string => (typeof item === 'string' ? item : item.id);

  const evict = (id: string): void => {
    seen.delete(id);
    if (evicted.size >= CROWD_MAX_EVICTED) {
      for (const old of evicted) { evicted.delete(old); break; }
    }
    evicted.add(id);
  };

  const prune = (ids: readonly string[]): void => {
    if (seen.size <= CROWD_MAX_SEEN) return;
    const keep = new Set(ids);
    for (const id of [...seen]) {
      if (seen.size <= CROWD_MAX_SEEN) return;
      if (!keep.has(id)) evict(id);
    }
    // Hard bound: a window larger than the cap evicts its oldest ids.
    for (const id of [...seen]) {
      if (seen.size <= CROWD_MAX_SEEN) return;
      evict(id);
    }
  };

  return {
    observe(items, { atLiveEdge }): boolean {
      const ids = items.map(idOf);
      if (!hydrated) {
        ids.forEach((id) => seen.add(id));
        order = ids;
        hydrated = true;
        prune(ids);
        return false;
      }
      const previousNewest = order.at(-1);
      const fresh = items.filter((item) => !seen.has(idOf(item)) && !evicted.has(idOf(item)));
      ids.forEach((id) => seen.add(id));
      order = ids;
      prune(ids);
      if (fresh.length === 0) return false;
      if (fresh.every((item) => originOf(item) === 'history')) return false;
      const live = fresh.some((item) => {
        const origin = originOf(item);
        if (origin === 'live') return true;
        if (origin === 'history') return false;
        if (typeof item === 'string') return true;
        if (!previousNewest) return true;
        return ids.indexOf(idOf(item)) > ids.indexOf(previousNewest);
      });
      return live && !atLiveEdge;
    },
    retention(): { seen: number; evicted: number } {
      return { seen: seen.size, evicted: evicted.size };
    },
    reset(): void {
      hydrated = false;
      order = [];
      seen.clear();
      evicted.clear();
    },
  };
}
