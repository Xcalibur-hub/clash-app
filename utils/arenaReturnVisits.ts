export type ReturnState = 'LIVE' | 'FINAL' | 'JUDGING' | 'PENDING' | 'SETTLED' | 'DRAW' | 'CANCELLED' | 'UPCOMING' | 'UNAVAILABLE' | 'ERROR';
export interface ArenaReturnItem {
  id: string;
  title: string | null;
  state: ReturnState;
  destination: `/arena/room/${string}` | `/clash/${string}` | null;
  basis: string;
}
/** Only authoritative status/phase/verdict facts. No device-clock settlement or winner inference. */
export function returnState(status: string, phase?: string, winner?: 'A' | 'B' | 'DRAW' | null): ReturnState {
  if (status === 'cancelled') return 'CANCELLED';
  if (status === 'settled') return winner === 'DRAW' ? 'DRAW' : winner === 'A' || winner === 'B' ? 'SETTLED' : 'UNAVAILABLE';
  if (status !== 'open') return 'UNAVAILABLE';
  return phase === 'closed' ? 'PENDING' : phase === 'judging' ? 'JUDGING' : phase === 'final_arguments' ? 'FINAL' : phase === 'scheduled' ? 'UPCOMING' : 'LIVE';
}
export const returnStateLabel: Record<ReturnState, string> = {
  LIVE: 'In progress', FINAL: 'Final arguments', JUDGING: 'Awaiting judgement', PENDING: 'Settlement pending',
  SETTLED: 'Official result available', DRAW: 'Official draw', CANCELLED: 'Cancelled · no verdict', UPCOMING: 'Upcoming',
  UNAVAILABLE: 'Unavailable or access revoked', ERROR: 'Couldn’t verify this Clash',
};

/** Invalidated duplicates cannot retain a readable title or route. Stable first-seen order. */
export function uniqueReturnItems(rows: readonly ArenaReturnItem[]): ArenaReturnItem[] {
  const items = new Map<string, ArenaReturnItem>();
  for (const row of rows) {
    const previous = items.get(row.id);
    if (!previous) items.set(row.id, row);
    else if (JSON.stringify(previous) !== JSON.stringify(row)) items.set(row.id, {id:row.id,title:null,state:'UNAVAILABLE',destination:null,basis:row.basis});
  }
  return [...items.values()];
}
