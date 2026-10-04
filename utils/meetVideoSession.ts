/**
 * Pure WebRTC session state machine helpers (testable without native modules).
 */

export type MeetVideoConnState =
  | 'idle'
  | 'preparing'
  | 'signaling'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'ended';

export type MeetVideoConnEvent =
  | 'start'
  | 'local_ready'
  | 'remote_signal'
  | 'ice_connected'
  | 'ice_disconnected'
  | 'peer_left'
  | 'fail'
  | 'cleanup';

const TRANSITIONS: Record<MeetVideoConnState, Partial<Record<MeetVideoConnEvent, MeetVideoConnState>>> = {
  idle: { start: 'preparing', cleanup: 'idle' },
  preparing: { local_ready: 'signaling', fail: 'failed', cleanup: 'ended' },
  signaling: { remote_signal: 'connecting', fail: 'failed', peer_left: 'ended', cleanup: 'ended' },
  connecting: {
    ice_connected: 'connected',
    fail: 'failed',
    peer_left: 'ended',
    cleanup: 'ended',
  },
  connected: {
    ice_disconnected: 'reconnecting',
    peer_left: 'ended',
    fail: 'failed',
    cleanup: 'ended',
  },
  reconnecting: {
    ice_connected: 'connected',
    fail: 'failed',
    peer_left: 'ended',
    cleanup: 'ended',
  },
  failed: { cleanup: 'ended', start: 'preparing' },
  ended: { cleanup: 'ended', start: 'preparing' },
};

export function reduceMeetVideoState(
  state: MeetVideoConnState,
  event: MeetVideoConnEvent,
): MeetVideoConnState {
  return TRANSITIONS[state][event] ?? state;
}

export function signalDedupeKey(id: string): string {
  return id.trim();
}

export function shouldApplySignal(
  seen: ReadonlySet<string>,
  signalId: string,
): boolean {
  if (!signalId) return false;
  return !seen.has(signalDedupeKey(signalId));
}
