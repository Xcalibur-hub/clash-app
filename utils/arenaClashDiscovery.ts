export type ClashDiscoveryState = 'PENDING' | 'LIVE' | 'UPCOMING' | 'COMPLETED';
export interface ClashDiscoveryEntry {
  id: string;
  takeId: string;
  roomId: string | null;
  title: string;
  status: string;
  state: ClashDiscoveryState;
  kind: 'CLASH' | 'CHALLENGE';
}
export function parseClashDiscovery(value: unknown): ClashDiscoveryEntry[] {
  if (!Array.isArray(value)) throw new Error('Invalid Clash discovery');
  return value.map(entry => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid Clash entry');
    const p = entry as Record<string, unknown>;
    if (typeof p.id !== 'string' || !p.id || typeof p.takeId !== 'string' || !p.takeId
      || typeof p.title !== 'string' || typeof p.status !== 'string'
      || !['PENDING','LIVE','UPCOMING','COMPLETED'].includes(p.state as string)
      || (p.roomId !== null && (typeof p.roomId !== 'string' || !p.roomId))) throw new Error('Invalid Clash entry');
    if (p.kind === 'CHALLENGE') {
      if (p.state !== 'PENDING' || p.status !== 'PENDING' || p.roomId !== null) throw new Error('Pending is not a duel');
    } else if (p.kind !== 'CLASH' || p.state === 'PENDING'
      || !['open','settled','cancelled'].includes(p.status as string)
      || (p.status !== 'open' && p.state !== 'COMPLETED')) throw new Error('Invalid Clash state');
    return p as unknown as ClashDiscoveryEntry;
  });
}
export function clashDiscoveryDestination(entry: ClashDiscoveryEntry): `/take/${string}` | `/arena/room/${string}` | `/clash/${string}` {
  if (entry.kind === 'CHALLENGE') return `/take/${entry.takeId}`;
  return entry.roomId ? `/arena/room/${entry.roomId}` : `/clash/${entry.takeId}`;
}
