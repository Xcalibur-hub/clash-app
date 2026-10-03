/**
 * Derive restrained live-room event banners from real room state only.
 * Never fabricates activity.
 */

export type LiveRoomEventKind =
  | 'new_arguments'
  | 'final_arguments'
  | 'judging'
  | 'result';

export interface LiveRoomEvent {
  kind: LiveRoomEventKind;
  label: string;
}

export type LiveRoomStatusForEvents =
  | 'OPEN'
  | 'FINAL_ARGUMENTS'
  | 'JUDGING'
  | 'SETTLED'
  | 'CANCELLED';

/** Phase-transition banner when status advances (null if no announcement). */
export function phaseEventForStatus(
  status: LiveRoomStatusForEvents,
  previous: LiveRoomStatusForEvents | null,
): LiveRoomEvent | null {
  if (!previous || previous === status) return null;
  if (status === 'FINAL_ARGUMENTS') {
    return { kind: 'final_arguments', label: 'Final arguments started' };
  }
  if (status === 'JUDGING') {
    return { kind: 'judging', label: 'Judging is open' };
  }
  if (status === 'SETTLED') {
    return { kind: 'result', label: 'Result is in' };
  }
  return null;
}

/** Floating pill for unseen peer arguments while scrolled up. */
export function newArgumentsEvent(count: number): LiveRoomEvent | null {
  if (count <= 0) return null;
  return {
    kind: 'new_arguments',
    label: `${count} new argument${count === 1 ? '' : 's'}`,
  };
}
