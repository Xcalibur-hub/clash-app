/**
 * Crowd arrival provenance.
 *
 * 1. Hydration and room changes never alert.
 * 2. Paginated history never alerts.
 * 3. A live row alerts even when its timestamp sorts before the window.
 * 4. Untagged rows alert only when appended after the known newest id.
 * 5. Removals and replays add no new ids and never alert.
 * 6. Bounded seen ids plus bounded tombstones suppress post-eviction replays.
 *    Limitation: ids evicted beyond MAX_EVICTED may replay as arrivals.
 */
export type CrowdArrivalItem = string | { id: string; origin?: 'hydrate' | 'live' | 'history' };

export interface CrowdArrivalTracker {
  observe(items: readonly CrowdArrivalItem[], options: { atLiveEdge: boolean }): boolean;
  reset(): void;
}

const MAX_SEEN = 1000;
const MAX_EVICTED = 500;

export function createCrowdArrivalTracker(): CrowdArrivalTracker {
  let hydrated = false;
  let order: string[] = [];
  const seen = new Set<string>();
  const evicted = new Set<string>();
  const originOf = (item: CrowdArrivalItem): string | undefined => (typeof item === 'string' ? undefined : item.origin);
  const idOf = (item: CrowdArrivalItem): string => (typeof item === 'string' ? item : item.id);

  return {
    observe(items, { atLiveEdge }): boolean {
      const ids = items.map(idOf);
      if (!hydrated) {
        ids.forEach((id) => seen.add(id));
        order = ids;
        hydrated = true;
        return false;
      }
      const previousNewest = order.at(-1);
      const fresh = items.filter((item) => !seen.has(idOf(item)) && !evicted.has(idOf(item)));
      ids.forEach((id) => seen.add(id));
      order = ids;
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
      if (seen.size > MAX_SEEN) {
        const keep = new Set(ids);
        for (const id of seen) {
          if (!keep.has(id)) {
            seen.delete(id);
            if (evicted.size >= MAX_EVICTED) {
              for (const old of evicted) { evicted.delete(old); break; }
            }
            evicted.add(id);
          }
          if (seen.size <= MAX_SEEN) break;
        }
      }
      return live && !atLiveEdge;
    },
    reset(): void {
      hydrated = false;
      order = [];
      seen.clear();
      evicted.clear();
    },
  };
}
