import type { ClashDiscoveryEntry } from './arenaClashDiscovery';

export type LiveDiscoveryMode = 'For You' | 'Following' | 'Discover';
export interface LiveDiscoveryDuel {
  entry: ClashDiscoveryEntry;
  hood: string | null;
  opensAt: number;
  phase?: string;
  fighters?: readonly ({ id: string; name: string; tint: string } | null)[];
  identityHidden: boolean;
}
export interface LiveDiscoverySignals {
  /** Only explicitly selected catalogue hoods, never inferred from text. */
  interests: readonly { hood: string; name: string }[];
  followedIds: readonly string[];
}
export interface RankedLiveDuel { duel: LiveDiscoveryDuel; reason: string }
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Pure selection within a server-authorized snapshot, not a global recommendation engine. */
export function rankLiveDiscovery(rows: readonly LiveDiscoveryDuel[], mode: LiveDiscoveryMode, signals: LiveDiscoverySignals): RankedLiveDuel[] {
  const interests = new Map(signals.interests.map(i => [i.hood, i.name]));
  const follows = new Set(signals.followedIds);
  const unique = new Map<string, LiveDiscoveryDuel | null>();
  for (const row of rows) {
    // Conflicting duplicates fail closed instead of arbitrarily picking a destination.
    if (unique.has(row.entry.id)) { if (JSON.stringify(unique.get(row.entry.id)) !== JSON.stringify(row)) unique.set(row.entry.id, null); }
    else unique.set(row.entry.id, row);
  }
  const followed = (row: LiveDiscoveryDuel): boolean => !row.identityHidden && !!row.fighters?.some(f => f && follows.has(f.id));
  return [...unique.values()].filter((row): row is LiveDiscoveryDuel => row !== null)
    .filter(row => row.entry.kind === 'CLASH' && row.entry.state === 'LIVE' && row.entry.status === 'open'
      && !['closed', 'scheduled', 'paused'].includes(row.phase ?? ''))
    .filter(row => mode !== 'Following' || followed(row)).sort((a, b) => {
    const ai = interests.has(a.hood ?? ''), bi = interests.has(b.hood ?? '');
    const af = followed(a), bf = followed(b);
    if (mode === 'For You') {
      if (ai !== bi) return Number(bi) - Number(ai);
      if (af !== bf) return Number(bf) - Number(af);
    } else if (mode === 'Discover') {
      const ao = !!a.hood && !ai, bo = !!b.hood && !bi;
      if (ao !== bo) return Number(bo) - Number(ao);
      if (af !== bf) return Number(af) - Number(bf);
      if (!interests.size) { const topic = compare(a.hood ?? '~', b.hood ?? '~'); if (topic) return topic; }
    }
    const recent = (Number.isFinite(b.opensAt) ? b.opensAt : 0) - (Number.isFinite(a.opensAt) ? a.opensAt : 0);
    return recent || compare(a.entry.id, b.entry.id);
  }).map(duel => ({ duel, reason: mode === 'Following' ? 'A fighter you follow' : mode === 'Discover'
    ? interests.size && duel.hood && !interests.has(duel.hood) ? 'Outside your selected interests' : !interests.size ? 'Topic exploration in the available snapshot' : 'More from the available live snapshot'
    : interests.has(duel.hood ?? '') ? 'Your interest: ' + interests.get(duel.hood!) : followed(duel) ? 'A fighter you follow' : 'Recent in the available live snapshot' }));
}

/** Polling can remove/revalidate rows, but only an explicit refresh introduces/reorders IDs. */
export function retainLiveOrder(previous: readonly RankedLiveDuel[], fresh: readonly RankedLiveDuel[]): RankedLiveDuel[] {
  const byId = new Map(fresh.map(row => [row.duel.entry.id, row]));
  return previous.flatMap(row => { const next = byId.get(row.duel.entry.id); return next ? [next] : []; });
}
