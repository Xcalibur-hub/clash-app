/**
 * Meet text-chat lifecycle — pure, allocation-light decisions shared by the
 * matching panel, the video prep screen and the chat screen.
 *
 * Rules encoded here (E3.1):
 *  - a finished or expired session can never be shown as connected again;
 *  - only the newest in-flight response may write state;
 *  - a cancelled search never opens a late match;
 *  - polling backs off on failure instead of hammering the RPC.
 *
 * No React / no network imports: every branch is unit-testable.
 */

/** Healthy poll cadence kept from the shipped behaviour. */
export const MEET_QUEUE_POLL_MS = 2200;
export const MEET_SESSION_POLL_MS = 4000;
export const MEET_MESSAGE_POLL_MS = 2200;

/** Ceiling for exponential backoff after repeated transport failures. */
export const MEET_MAX_POLL_MS = 20_000;

/** Server sweeps waiting rows after 30 minutes; the client gives up there too. */
export const MEET_QUEUE_TTL_MS = 30 * 60_000;

/**
 * Lease-refresh cadence while the screen is focused. The server lease is 90 s
 * and only a beat keeps it alive, so a backgrounded or killed app releases the
 * session instead of pinning the peer (E3.2).
 */
export const MEET_HEARTBEAT_MS = 15_000;

export type MeetChatStatus = 'connected' | 'disconnected' | 'ended' | 'expired';

/** Structural slice of a session payload — keeps this module dependency-free. */
export interface MeetLifecycleSession {
  status: 'active' | 'ended';
  peerConnected: boolean;
  endReason: string | null;
}

/** Structural slice of a queue payload. */
export interface MeetQueueSnapshot {
  queued: boolean;
  matched: boolean;
  alreadyActive?: boolean;
  queuedAt?: number;
  session?: MeetLifecycleSession | null;
}

/**
 * Single source of truth for what the chat screen is allowed to show.
 * `ended` always wins over a stale `peerConnected: true` payload: the server
 * only ends a session through `leave_meet_session`, which records a reason.
 */
export function meetChatStatus(session: MeetLifecycleSession): MeetChatStatus {
  if (session.status !== 'active') {
    return session.endReason === 'expired' ? 'expired' : 'ended';
  }
  return session.peerConnected ? 'connected' : 'disconnected';
}

/** Terminal statuses must never be replaced by a later "active" payload. */
export function meetStatusIsTerminal(status: MeetChatStatus): boolean {
  return status === 'ended' || status === 'expired';
}

/** A closed chat can be read but never written. */
export function meetCanSend(status: MeetChatStatus): boolean {
  return status === 'connected';
}

export type MeetQueueOutcome = 'matched' | 'searching' | 'lost';

/**
 * Classifies one queue poll. `lost` covers every stale shape: a match whose
 * session already ended, a swept waiting row, or a wait that outlived the
 * server's 30-minute sweep. Callers must never resurrect `lost` matches.
 */
export function meetQueueOutcome(
  state: MeetQueueSnapshot,
  now: number,
): MeetQueueOutcome {
  const session = state.session;
  const live = session != null && session.status === 'active';

  if ((state.matched || state.alreadyActive === true) && live) return 'matched';
  if (state.matched || state.alreadyActive === true) return 'lost';
  if (state.queued) {
    if (state.queuedAt != null && now - state.queuedAt > MEET_QUEUE_TTL_MS) {
      return 'lost';
    }
    return 'searching';
  }
  return 'lost';
}

/**
 * `join_meet_queue` returns an existing active session regardless of channel.
 * The UI must say which one it is instead of silently entering a wrong flow.
 */
export function meetActiveSessionChannel(
  activeChannel: 'TEXT' | 'VIDEO',
  requestedChannel: 'TEXT' | 'VIDEO',
): 'same-channel' | 'other-channel' {
  return activeChannel === requestedChannel ? 'same-channel' : 'other-channel';
}

/** Deterministic exponential backoff: base, 2x, 4x … capped. Never 0. */
export function meetPollDelay(
  baseMs: number,
  failures: number,
  maxMs: number = MEET_MAX_POLL_MS,
): number {
  const base = Math.max(250, Math.round(baseMs));
  if (!Number.isFinite(failures) || failures <= 0) return base;
  const cap = Math.max(base, Math.round(maxMs));
  const exponent = Math.min(Math.floor(failures), 6);
  return Math.min(cap, base * 2 ** exponent);
}

/**
 * True when the server lease should be refreshed. The first beat is always due;
 * a backwards clock jump (device time changed) beats instead of idling.
 */
export function meetHeartbeatDue(lastBeatAt: number | null, now: number): boolean {
  if (lastBeatAt == null || !Number.isFinite(lastBeatAt)) return true;
  if (!Number.isFinite(now)) return false;
  const elapsed = now - lastBeatAt;
  return elapsed < 0 || elapsed >= MEET_HEARTBEAT_MS;
}

/** Monotonic request token. Only the newest response may commit. */
export interface MeetRequestGuard {
  begin: () => number;
  isCurrent: (token: number) => boolean;
  invalidate: () => void;
}

export function createMeetRequestGuard(): MeetRequestGuard {
  let generation = 0;
  return {
    begin: (): number => {
      generation += 1;
      return generation;
    },
    isCurrent: (token: number): boolean => token === generation,
    invalidate: (): void => {
      generation += 1;
    },
  };
}

/**
 * Out-of-order polling can deliver a stale message page after a newer one.
 * Merging by id keeps the transcript monotonic and idempotent — two listeners
 * or two overlapping ticks can never duplicate a bubble.
 */
export function mergeMeetMessages<T extends { id: string; createdAt: number }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const byId = new Map<string, T>();
  for (const message of current) byId.set(message.id, message);
  let changed = false;
  for (const message of incoming) {
    if (byId.has(message.id)) continue;
    byId.set(message.id, message);
    changed = true;
  }
  if (!changed) return current as T[];
  return [...byId.values()].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
}

/** Errors that mean "this conversation is over" — retrying cannot help. */
export function meetIsTerminalError(code: string | null | undefined): boolean {
  return code === 'P0002' || code === 'P0003' || code === '42501';
}

/**
 * Race: the user taps Cancel while a match lands. The match must be ended, not
 * displayed. Returns what the caller should do with the late session.
 */
export function meetCancelVsMatch(
  cancelled: boolean,
  hasSession: boolean,
): 'accept' | 'discard' {
  return cancelled || !hasSession ? 'discard' : 'accept';
}
