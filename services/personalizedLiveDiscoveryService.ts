import { currentUserId, requireSupabase, requestError } from './supabaseClient';
import { currentViewerProfileId } from './apiService';
import { fetchClashDiscovery } from './arenaClashDiscoveryService';
import { fetchClashView } from './clashEngineService';
import { fetchRoom } from './liveArenaService';
import { fetchInterestCatalogue, fetchMyArenaInterests } from './arenaInterestService';
import type { LiveDiscoveryDuel, LiveDiscoverySignals } from '../utils/personalizedLiveDiscovery';

export interface PersonalizedLiveSnapshot {
  rows: LiveDiscoveryDuel[];
  signals: LiveDiscoverySignals;
  interestsError: boolean;
  followingError: boolean;
  metadataError: boolean;
}

/** Read adapters only. Bound by the existing 60-item discovery RPC, four detail reads in flight. */
export async function fetchPersonalizedLiveDiscovery(expectedAccount: string, isCurrent: () => boolean = () => true): Promise<PersonalizedLiveSnapshot> {
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expired = true; reject(new Error('discovery_timeout')); }, 45_000);
  });
  try { return await Promise.race([readSnapshot(expectedAccount, () => !expired && isCurrent()), timeout]); }
  finally { clearTimeout(timer); }
}

async function readSnapshot(expectedAccount: string, isCurrent: () => boolean): Promise<PersonalizedLiveSnapshot> {
  const assertAccount = async (): Promise<void> => {
    if (!isCurrent() || await currentUserId() !== expectedAccount || !isCurrent()) throw new Error('account_changed');
  };
  await assertAccount();
  const entries = await fetchClashDiscovery();
  if (entries.length > 60) throw new Error('Discovery snapshot exceeds the existing contract');
  await assertAccount();
  const takeIds = [...new Set(entries.filter(e => e.kind === 'CLASH').map(e => e.takeId))];
  const sources = takeIds.length ? await requireSupabase().from('takes').select('id,hood')
    .in('id', takeIds).filter('is_runtime_fixture', 'eq', false).limit(60) : { data: [], error: null };
  if (sources.error) throw requestError(sources.error);
  const hoods = new Map((sources.data ?? []).map(row => [row.id, row.hood]));
  const candidates = entries.filter(e => e.kind === 'CLASH' && hoods.has(e.takeId));
  const rows: LiveDiscoveryDuel[] = [];
  let next = 0, metadataError = false;
  await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, async () => {
    while (next < candidates.length) {
      const entry = candidates[next++];
      await assertAccount();
      try {
        const view = await fetchClashView(entry.id);
        if (!view || view.clashId !== entry.id || view.takeId !== entry.takeId || view.roomId !== entry.roomId) continue;
        // Room access must still be readable, even when a known Clash ID remains in the snapshot.
        const room = entry.roomId ? await fetchRoom(entry.roomId) : null;
        if (room && (room.roomId !== entry.roomId || room.clashId !== entry.id || room.roomMode !== 'DUEL')) continue;
        const status = room?.duel?.status ?? view.status;
        const state = status !== 'open' || room?.phase === 'closed' ? 'COMPLETED' : room?.phase === 'scheduled' ? 'UPCOMING' : entry.state;
        rows.push({ entry: { ...entry, state, status, title: view.sideAText }, hood: hoods.get(entry.takeId) ?? null,
          opensAt: view.opensAt, phase: room?.phase,
          fighters: view.revealed ? [view.sideA, view.sideB] : undefined,
          identityHidden: view.mode === 'BLIND' && !view.revealed });
      } catch { metadataError = true; /* Denied/failed detail reads never become visible cards. */ }
    }
  }));
  let interests: LiveDiscoverySignals['interests'] = [], followedIds: string[] = [];
  let interestsError = false, followingError = false;
  await assertAccount();
  await Promise.all([
    (async () => {
      try {
        const [catalogue, preferences] = await Promise.all([fetchInterestCatalogue(), fetchMyArenaInterests()]);
        interests = catalogue.filter(i => preferences.topicIds.includes(i.id)).flatMap(i => i.hoods.map(hood => ({ hood, name: i.name })));
      } catch { interestsError = true; }
    })(),
    (async () => {
      try {
        const ids = [...new Set(rows.flatMap(row => row.fighters?.flatMap(f => f ? [f.id] : []) ?? []))];
        const profileId = await currentViewerProfileId();
        if (!profileId) throw new Error('Viewer profile unavailable');
        await assertAccount();
        // Never enumerate the viewer's entire follow graph or query hidden BLIND identities.
        if (ids.length) {
          const { data, error } = await requireSupabase().from('follows').select('following_id')
            .eq('follower_id', profileId).in('following_id', ids).limit(120);
          if (error) throw requestError(error);
          followedIds = (data ?? []).map(row => row.following_id);
        }
      } catch { followingError = true; }
    })(),
  ]);
  await assertAccount();
  const order = new Map(entries.map((entry, index) => [entry.id, index]));
  rows.sort((a,b) => order.get(a.entry.id)! - order.get(b.entry.id)!);
  return { rows, signals: { interests, followedIds }, interestsError, followingError, metadataError };
}
