/**
 * Crowd arrival provenance.
 *
 * Invariants:
 * 1. Hydration and room changes never alert.
 * 2. Paginated history rows never alert, whatever their timestamp.
 * 3. A live row alerts even when its timestamp sorts before the window.
 * 4. Rows without provenance alert only when appended after the known newest id,
 *    so a prepended page is never mistaken for an arrival.
 * 5. Moderation removals and replays add no ids and never alert.
 */
export type CrowdArrivalItem = string | { id: string; origin?: 'hydrate' | 'live' | 'history' };

export interface CrowdArrivalTracker {
  observe(items: readonly CrowdArrivalItem[], options: { atLiveEdge: boolean }): boolean;
  reset(): void;
}

const MAX_SEEN = 1000;

export function createCrowdArrivalTracker(): CrowdArrivalTracker {
  let hydrated = false;
  let order: string[] = [];
  const seen = new Set<string>();
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
      const fresh = items.filter((item) => !seen.has(idOf(item)));
      ids.forEach((id) => seen.add(id));
      order = ids;
      if (fresh.length === 0) return false;
      if (fresh.every((item) => originOf(item) === 'history')) return false;
      const live = fresh.some((item) => {
        const origin = originOf(item);
        if (origin === 'live') return true;
        if (origin === 'history') return false;
        if (typeof item === 'string') return true; // pure id callers are live by contract
        if (!previousNewest) return true;
        return ids.indexOf(idOf(item)) > ids.indexOf(previousNewest);
      });
      if (seen.size > MAX_SEEN) {
        const keep = new Set(ids);
        for (const id of seen) { if (!keep.has(id)) seen.delete(id); if (seen.size <= MAX_SEEN) break; }
      }
      return live && !atLiveEdge;
    },
    reset(): void {
      hydrated = false;
      order = [];
      seen.clear();
    },
  };
}
