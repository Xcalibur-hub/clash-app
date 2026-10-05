/**
 * Bounded, pure reducer for the live event stream (Phase 15.4).
 *
 * Realtime is transport only: the database stays authoritative. Events are
 * applied locally so a busy room never forces a full refetch (or a full screen
 * rerender) — and after a reconnect the same events are replayed from
 * `creator_live_events_since` to resync.
 */

import type {
  LiveActionKind,
  LiveInteractionStatus,
  LiveInteractionType,
  LiveOption,
  LiveStatus,
  LiveTallies,
} from './creatorLiveState';

export type LiveEventKind =
  | 'SESSION_STARTED'
  | 'SESSION_ENDED'
  | 'INTERACTION_OPENED'
  | 'INTERACTION_CLOSED'
  | 'ACTION_TRIGGERED'
  | 'TALLY';

export interface LiveEvent {
  id: string;
  kind: LiveEventKind;
  interactionId: string | null;
  actionKind: LiveActionKind | null;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface LiveInteractionState {
  id: string;
  type: LiveInteractionType;
  prompt: string;
  options: LiveOption[] | null;
  actionKind: LiveActionKind | null;
  threshold: number | null;
  status: LiveInteractionStatus;
  tallies: LiveTallies;
  totalVotes: number;
  result: Record<string, unknown> | null;
  openedAt: number;
  closesAt: number | null;
  voted: boolean;
  myVote: string | null;
  canParticipate: boolean;
}

export interface LiveBanner {
  kind: LiveEventKind;
  label: string;
  actionKind: LiveActionKind | null;
  interactionId: string | null;
}

export interface LiveScreenState {
  status: LiveStatus;
  interactions: LiveInteractionState[];
  banner: LiveBanner | null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function asOptions(value: unknown): LiveOption[] | null {
  if (!Array.isArray(value)) return null;
  const out: LiveOption[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.label !== 'string') continue;
    out.push({ id: record.id, label: record.label });
  }
  return out.length > 0 ? out : null;
}

export function asTallies(value: unknown): LiveTallies | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: LiveTallies = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = asNumber(raw);
    if (n !== null) out[key] = n;
  }
  return out;
}

function patch(
  state: LiveScreenState,
  interactionId: string | null,
  update: (current: LiveInteractionState) => LiveInteractionState,
): LiveScreenState {
  if (interactionId === null) return state;
  let touched = false;
  const interactions = state.interactions.map((current) => {
    if (current.id !== interactionId) return current;
    touched = true;
    return update(current);
  });
  return touched ? { ...state, interactions } : state;
}

/** Apply one event. Unknown or stale shapes leave the state untouched. */
export function applyLiveEvent(state: LiveScreenState, event: LiveEvent): LiveScreenState {
  switch (event.kind) {
    case 'SESSION_STARTED':
      return {
        ...state,
        status: 'LIVE',
        banner: { kind: event.kind, label: 'Live now', actionKind: null, interactionId: null },
      };
    case 'SESSION_ENDED':
      return {
        ...state,
        status: 'ENDED',
        banner: { kind: event.kind, label: 'Session ended', actionKind: null, interactionId: null },
      };
    case 'TALLY': {
      const tallies = asTallies(event.payload.tallies);
      const total = asNumber(event.payload.total);
      return patch(state, event.interactionId, (current) => ({
        ...current,
        tallies: tallies ?? current.tallies,
        totalVotes: total ?? current.totalVotes,
      }));
    }
    case 'INTERACTION_OPENED': {
      const id = event.interactionId;
      if (id === null) return state;
      const next: LiveInteractionState = {
        id,
        type: (event.payload.type as LiveInteractionType) ?? 'POLL',
        prompt: typeof event.payload.prompt === 'string' ? event.payload.prompt : '',
        options: asOptions(event.payload.options),
        actionKind: event.actionKind,
        threshold: asNumber(event.payload.threshold),
        status: 'OPEN',
        tallies: {},
        totalVotes: 0,
        result: null,
        openedAt: event.createdAt,
        closesAt: asNumber(event.payload.closesAt),
        voted: false,
        myVote: null,
        canParticipate: true,
      };
      const exists = state.interactions.some((item) => item.id === id);
      return {
        ...state,
        interactions: exists
          ? state.interactions.map((item) =>
              item.id === id ? { ...item, ...next, voted: item.voted, myVote: item.myVote } : item,
            )
          : [next, ...state.interactions],
        banner: {
          kind: event.kind,
          label: 'New interaction',
          actionKind: event.actionKind,
          interactionId: id,
        },
      };
    }
    case 'INTERACTION_CLOSED': {
      const result = (event.payload.result as Record<string, unknown> | undefined) ?? null;
      const status = event.payload.status as LiveInteractionStatus | undefined;
      return patch(state, event.interactionId, (current) => ({
        ...current,
        status: status ?? 'CLOSED',
        result,
        canParticipate: false,
      }));
    }
    case 'ACTION_TRIGGERED':
      return {
        ...patch(state, event.interactionId, (current) => ({
          ...current,
          status: 'TRIGGERED',
          canParticipate: false,
        })),
        banner: {
          kind: event.kind,
          label: 'Action triggered',
          actionKind: event.actionKind,
          interactionId: event.interactionId,
        },
      };
    default:
      return state;
  }
}


/** Apply a batch (realtime burst or reconnect replay) in order. */
export function applyLiveEvents(
  state: LiveScreenState,
  events: readonly LiveEvent[],
): LiveScreenState {
  return events.reduce(applyLiveEvent, state);
}

/** Merged, time-ordered, deduped cursor — bounded so memory stays flat. */
export function mergeEvents(
  seen: readonly LiveEvent[],
  incoming: readonly LiveEvent[],
  limit = 200,
): LiveEvent[] {
  const byId = new Map<string, LiveEvent>();
  for (const event of seen) byId.set(event.id, event);
  for (const event of incoming) byId.set(event.id, event);
  const out = Array.from(byId.values()).sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  return out.slice(Math.max(0, out.length - limit));
}

/** The one interaction that should dominate the viewer layer right now. */
export function activeInteraction(
  interactions: readonly LiveInteractionState[],
): LiveInteractionState | null {
  const open = interactions.filter((item) => item.status === 'OPEN');
  if (open.length > 0) return open[0] ?? null;
  const triggered = interactions.find((item) => item.status === 'TRIGGERED');
  return triggered ?? interactions[0] ?? null;
}

