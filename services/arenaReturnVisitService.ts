import { currentUserId, requireSupabase, requestError } from './supabaseClient';
import { currentViewerProfileId } from './apiService';
import { fetchProfileClashes } from './profileService';
import { fetchClashView } from './clashEngineService';
import { fetchRoom } from './liveArenaService';
import { fetchPersonalizedLiveDiscovery } from './personalizedLiveDiscoveryService';
import { returnState, uniqueReturnItems, type ArenaReturnItem } from '../utils/arenaReturnVisits';

async function guard(account: string, active: () => boolean): Promise<void> {
  if (!active() || await currentUserId() !== account || !active()) throw new Error('account_changed');
}

/** Reused by return cards and existing Clash notifications, including known-ID navigation. */
export async function resolveArenaReturn(account: string, clashId: string, active: () => boolean = () => true, requireFighter = false): Promise<ArenaReturnItem> {
  await guard(account, active);
  const unavailable: ArenaReturnItem = {id:clashId,title:null,state:'UNAVAILABLE',destination:null,basis:'Recent Clash'};
  const view = await fetchClashView(clashId);
  await guard(account, active);
  if (!view || view.clashId !== clashId || (requireFighter && !view.isParticipant)) return unavailable;
  const room = view.roomId ? await fetchRoom(view.roomId) : null;
  await guard(account, active);
  if (room && (room.roomMode !== 'DUEL' || room.roomId !== view.roomId || room.clashId !== clashId || !room.duel
    || (requireFighter && !['fighter_a','fighter_b'].includes(room.duel.viewerRelationship)))) return unavailable;
  const state = returnState(room?.duel?.status ?? view.status, room?.phase, room?.duel?.verdict?.winnerSide ?? view.verdict?.winnerSide);
  if (state === 'UNAVAILABLE') return unavailable;
  return {id:clashId,title:view.sideAText,state,destination:view.roomId ? `/arena/room/${view.roomId}` : `/clash/${view.takeId}`,
    basis:requireFighter ? 'You are a fighter in this Clash' : 'Recorded Clash activity'};
}

export async function fetchOwnArenaReturns(account: string, active: () => boolean): Promise<ArenaReturnItem[]> {
  await guard(account, active);
  const profile = await currentViewerProfileId();
  await guard(account, active);
  if (!profile) throw new Error('Viewer profile unavailable');
  const history = await fetchProfileClashes(profile);
  if (history.length > 30) throw new Error('Unexpected history bound');
  await guard(account, active);
  const ids = [...new Set(history.map(row => row.clash.takeId))];
  const sources = ids.length ? await requireSupabase().from('takes').select('id').in('id',ids)
    .filter('is_runtime_fixture','eq',false).limit(30) : {data:[],error:null};
  if (sources.error) throw requestError(sources.error);
  const visible = new Set((sources.data ?? []).map(row => row.id));
  const candidates = history.filter(row => visible.has(row.clash.takeId));
  const results: ArenaReturnItem[] = new Array(candidates.length);
  let next = 0;
  await Promise.all(Array.from({length:Math.min(4,candidates.length)}, async () => {
    while (next < candidates.length) {
      const index = next++, id = candidates[index].clash.id;
      await guard(account, active);
      try { results[index] = await resolveArenaReturn(account,id,active,true); }
      catch (error) {
        await guard(account, active);
        const denied = ['42501','P0002','P0003'].includes(String((error as {code?:string})?.code));
        results[index] = {id,title:null,state:denied?'UNAVAILABLE':'ERROR',destination:null,basis:'Recent Clash'};
      }
    }
  }));
  await guard(account, active);
  return uniqueReturnItems(results);
}

export async function fetchFollowedArenaReturns(account: string, active: () => boolean): Promise<{items:ArenaReturnItem[];partial:boolean}> {
  const snapshot = await fetchPersonalizedLiveDiscovery(account,active);
  await guard(account, active);
  if (snapshot.followingError) throw new Error('Follow relationships unavailable');
  const followed = new Set(snapshot.signals.followedIds);
  const rows = snapshot.rows.filter(row => !row.identityHidden && row.fighters?.some(f => f && followed.has(f.id)));
  return {items:uniqueReturnItems(rows.map(row => {
    const state = returnState(row.entry.status,row.phase,row.verdictWinner);
    return {id:row.entry.id,title:state === 'UNAVAILABLE'?null:row.entry.title,state,
      destination:state === 'UNAVAILABLE'?null:row.entry.roomId ? `/arena/room/${row.entry.roomId}` : `/clash/${row.entry.takeId}`,
      basis:'You follow a public fighter'};
  })),partial:snapshot.metadataError};
}
