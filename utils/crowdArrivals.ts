/**
 * ID-based arrival detection for the Crowd.
 *
 * Arrivals are genuine message IDs that were not present before, independent of
 * timestamp ordering. Pagination, hydration, moderation removal and replays
 * never raise the affordance.
 */
export interface CrowdArrivalTracker {
  observe(ids: readonly string[], options: { source: 'hydrate' | 'live' | 'history'; atLiveEdge: boolean }): boolean;
  reset(): void;
}

const MAX_SEEN = 1000;

export function createCrowdArrivalTracker(): CrowdArrivalTracker {
  let hydrated = false;
  const seen = new Set<string>();
  return {
    observe(ids, { source, atLiveEdge }): boolean {
      if (!hydrated) {
        ids.forEach((id) => seen.add(id));
        hydrated = true;
        return false;
      }
      let fresh = 0;
      for (const id of ids) {
        if (!seen.has(id)) {
          fresh += 1;
          seen.add(id);
        }
      }
      // Bound memory without re-alerting on removals: keep the newest window.
      if (seen.size > MAX_SEEN) {
        const keep = new Set(ids);
        for (const id of seen) {
          if (!keep.has(id)) seen.delete(id);
          if (seen.size <= MAX_SEEN) break;
        }
      }
      if (source === 'history') return false;
      return fresh > 0 && !atLiveEdge;
    },
    reset(): void {
      hydrated = false;
      seen.clear();
    },
  };
}
