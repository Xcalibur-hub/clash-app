import type { ClashDiscoveryEntry } from './arenaClashDiscovery';
import type { ArenaRoom } from '../services/liveArenaService';

/**
 * One suggestion, chosen from an existing server-ordered discovery snapshot.
 * Only a live, room-backed Clash that is not the one just watched qualifies.
 */
export function selectNextClash(
  entries: readonly ClashDiscoveryEntry[],
  currentClashId: string,
): ClashDiscoveryEntry | null {
  for (const entry of entries) {
    if (entry.kind !== 'CLASH') continue;
    if (!entry.id || entry.id === currentClashId) continue;
    // Terminal, upcoming and pending entries are never suggested as live.
    if (entry.status !== 'open' || entry.state !== 'LIVE' || !entry.roomId) continue;
    return entry;
  }
  return null;
}

/**
 * Re-check the room immediately before entering. A suggestion that has settled,
 * closed, changed identity or is not a canonical duel is refused.
 */
export function nextClashStillAvailable(entry: ClashDiscoveryEntry, room: ArenaRoom | null): boolean {
  if (!room || !entry.roomId) return false;
  if (room.roomId !== entry.roomId || room.clashId !== entry.id) return false;
  if (room.roomMode !== 'DUEL' || room.duel?.status !== 'open') return false;
  return room.phase === 'open' || room.phase === 'final_arguments';
}
