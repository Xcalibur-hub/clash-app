/**
 * Interactive Creator Live API (Phase 15.4).
 *
 * Screens never touch `creator_live_*` tables directly. Lifecycle, tallies,
 * results and triggered actions are computed server-side; this module only
 * submits viewer intent and subscribes to the viewer-safe event stream.
 *
 * Realtime is transport only. After a reconnect the caller resyncs with
 * `fetchCreatorLiveEventsSince`, and the database stays authoritative.
 */

import type { LiveEvent } from '../utils/creatorLiveEvents';
import type { LiveActionKind, LiveInteractionType } from '../utils/creatorLiveState';
import { getPublicMediaUrl } from './mediaService';
import { requestError, requireSupabase, SupabaseError } from './supabaseClient';
import {
  parseCreatorLiveInteractionList,
  parseCreatorLiveSession,
  parseCreatorLiveSessionList,
  parseCreatorLiveVoteResult,
  type CreatorLiveInteraction,
  type CreatorLiveSession,
  type CreatorLiveVoteResult,
  type LiveMedia,
} from './creatorLiveMappers';

function client(): ReturnType<typeof requireSupabase> {
  return requireSupabase();
}

export function liveCoverUrl(media: LiveMedia | null | undefined): string | null {
  if (!media) return null;
  try {
    return getPublicMediaUrl(media.bucket, media.path);
  } catch {
    return null;
  }
}

export interface CreateLiveSessionInput {
  title: string;
  description?: string;
  access: 'FREE' | 'SUBSCRIBER';
  scheduledAt?: number | null;
  coverMediaObjectId?: string | null;
  allowPolls: boolean;
  allowChoices: boolean;
  allowCrowdActions: boolean;
  allowGameActions: boolean;
  streamUrl?: string | null;
  provider?: 'standby' | 'hls' | 'file' | 'embed';
}

export interface CreateLiveInteractionInput {
  sessionId: string;
  type: LiveInteractionType;
  prompt: string;
  options?: { id: string; label: string }[] | null;
  actionKind?: LiveActionKind | null;
  threshold?: number | null;
  durationSeconds?: number | null;
}

export async function fetchCreatorLiveSession(
  sessionId: string,
): Promise<CreatorLiveSession | null> {
  const { data, error } = await requireSupabase().rpc('get_creator_live_session', {
    p_session_id: sessionId,
  });
  if (error) throw requestError(error);
  if (data === null) return null;
  return parseCreatorLiveSession(data);
}

export async function fetchCreatorLiveSessions(
  creatorId: string,
  limit = 10,
): Promise<CreatorLiveSession[]> {
  const { data, error } = await requireSupabase().rpc('list_creator_live_sessions', {
    p_creator_id: creatorId,
    p_limit: limit,
  });
  if (error) throw requestError(error);
  return parseCreatorLiveSessionList(data);
}

export async function fetchMyCreatorLiveSessions(limit = 20): Promise<CreatorLiveSession[]> {
  const { data, error } = await requireSupabase().rpc('list_my_creator_live_sessions', {
    p_limit: limit,
  });
  if (error) throw requestError(error);
  return parseCreatorLiveSessionList(data);
}

export async function fetchCreatorLiveInteractions(
  sessionId: string,
  limit = 20,
): Promise<CreatorLiveInteraction[]> {
  const { data, error } = await requireSupabase().rpc('list_creator_live_interactions', {
    p_session_id: sessionId,
    p_limit: limit,
  });
  if (error) throw requestError(error);
  return parseCreatorLiveInteractionList(data);
}

export async function createCreatorLiveSession(input: CreateLiveSessionInput): Promise<string> {
  const { data, error } = await requireSupabase().rpc('create_creator_live_session', {
    p_title: input.title,
    p_description: input.description ?? '',
    p_access: input.access,
    p_scheduled_at:
      input.scheduledAt != null ? new Date(input.scheduledAt).toISOString() : undefined,
    p_cover_media_object_id: input.coverMediaObjectId ?? undefined,
    p_allow_polls: input.allowPolls,
    p_allow_choices: input.allowChoices,
    p_allow_crowd_actions: input.allowCrowdActions,
    p_allow_game_actions: input.allowGameActions,
    p_stream_url: input.streamUrl ?? undefined,
    p_provider: input.provider ?? 'standby',
  });
  if (error) throw requestError(error);
  const row = data as { id?: unknown } | null;
  if (!row || typeof row.id !== 'string') {
    throw new SupabaseError('create_creator_live_session returned no row', 'bad_payload');
  }
  return row.id;
}

export async function startCreatorLiveSession(sessionId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('start_creator_live_session', {
    p_session_id: sessionId,
  });
  if (error) throw requestError(error);
}

export async function endCreatorLiveSession(sessionId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('end_creator_live_session', {
    p_session_id: sessionId,
  });
  if (error) throw requestError(error);
}

export async function createCreatorLiveInteraction(
  input: CreateLiveInteractionInput,
): Promise<CreatorLiveInteraction> {
  const { data, error } = await requireSupabase().rpc('create_creator_live_interaction', {
    p_session_id: input.sessionId,
    p_type: input.type,
    p_prompt: input.prompt,
    p_options: input.options ?? undefined,
    p_action_kind: input.actionKind ?? undefined,
    p_threshold: input.threshold ?? undefined,
    p_duration_seconds: input.durationSeconds ?? undefined,
  });
  if (error) throw requestError(error);
  const row = data as { id?: unknown } | null;
  const id = row && typeof row.id === 'string' ? row.id : null;
  if (!id) throw new SupabaseError('create_creator_live_interaction returned no row', 'bad_payload');
  const created = await fetchCreatorLiveInteractions(input.sessionId, 1);
  return (
    created.find((item) => item.id === id) ?? {
      id,
      sessionId: input.sessionId,
      type: input.type,
      prompt: input.prompt,
      options: input.options ? [...input.options] : null,
      actionKind: input.actionKind ?? null,
      threshold: input.threshold ?? null,
      status: 'OPEN',
      openedAt: Date.now(),
      closesAt: null,
      closedAt: null,
      triggeredAt: null,
      tallies: {},
      totalVotes: 0,
      triggered: false,
      result: null,
      voted: false,
      myVote: null,
      canParticipate: false,
    }
  );
}

export async function closeCreatorLiveInteraction(interactionId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('close_creator_live_interaction', {
    p_interaction_id: interactionId,
  });
  if (error) throw requestError(error);
}

/** Viewer intent only: the server recomputes the tally and decides triggers. */
export async function submitCreatorLiveVote(
  interactionId: string,
  optionId?: string | null,
): Promise<CreatorLiveVoteResult> {
  const { data, error } = await requireSupabase().rpc('submit_creator_live_vote', {
    p_interaction_id: interactionId,
    p_option_id: optionId ?? undefined,
  });
  if (error) throw requestError(error);
  const result = parseCreatorLiveVoteResult(data);
  if (!result) throw new SupabaseError('submit_creator_live_vote returned no result', 'bad_payload');
  return result;
}

/** Heartbeat — returns the current watch count (counts only, never a roster). */
export async function touchCreatorLiveViewer(sessionId: string): Promise<number> {
  const { data, error } = await requireSupabase().rpc('touch_creator_live_viewer', {
    p_session_id: sessionId,
  });
  if (error) throw requestError(error);
  return typeof data === 'number' && Number.isFinite(data) ? data : 0;
}

export async function reportCreatorLiveSession(
  sessionId: string,
  reason: 'spam' | 'harassment' | 'hate' | 'sexual' | 'violence' | 'misinformation' | 'impersonation' | 'copyright' | 'other',
  detail?: string,
): Promise<void> {
  const { error } = await requireSupabase().rpc('report_creator_live_session', {
    p_session_id: sessionId,
    p_reason: reason,
    p_detail: detail ?? undefined,
  });
  if (error) throw requestError(error);
}


// ── Realtime transport ──────────────────────────────────────────────────────

const EVENT_KINDS = [
  'SESSION_STARTED',
  'SESSION_ENDED',
  'INTERACTION_OPENED',
  'INTERACTION_CLOSED',
  'ACTION_TRIGGERED',
  'TALLY',
] as const;

const ACTION_KINDS: readonly LiveActionKind[] = [
  'LIGHTS_OFF',
  'LIGHTS_ON',
  'OPEN_LEFT_DOOR',
  'OPEN_RIGHT_DOOR',
  'FOG_BURST',
  'MUSIC_STING',
  'CAMERA_CUT',
  'HOLD_FRAME',
];

/** Map one viewer-safe event row onto the reducer's event shape. */
export function parseLiveEventRow(row: unknown): LiveEvent | null {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.kind !== 'string') return null;
  const kind = EVENT_KINDS.find((entry) => entry === record.kind);
  if (!kind) return null;
  const createdAt =
    typeof record.created_at === 'string' ? Date.parse(record.created_at) || Date.now() : Date.now();
  const actionKind =
    typeof record.action_kind === 'string'
      ? ACTION_KINDS.find((entry) => entry === record.action_kind) ?? null
      : null;
  const payload =
    record.payload !== null && typeof record.payload === 'object' && !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>)
      : {};
  return {
    id: record.id,
    kind,
    interactionId: typeof record.interaction_id === 'string' ? record.interaction_id : null,
    actionKind,
    payload,
    createdAt,
  };
}

/** Resync after a reconnect: replays the same log the transport pushed. */
export async function fetchCreatorLiveEventsSince(
  sessionId: string,
  afterMs: number | null,
  limit = 60,
): Promise<LiveEvent[]> {
  const { data, error } = await requireSupabase().rpc('creator_live_events_since', {
    p_session_id: sessionId,
    p_after: afterMs != null ? new Date(afterMs).toISOString() : undefined,
    p_limit: limit,
  });
  if (error) throw requestError(error);
  if (!Array.isArray(data)) return [];
  return data
    .map((entry) => {
      const record = entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>) : null;
      if (!record) return null;
      return parseLiveEventRow({
        id: record.id,
        kind: record.kind,
        interaction_id: record.interactionId,
        action_kind: record.actionKind,
        payload: record.payload,
        created_at: record.createdAt,
      });
    })
    .filter((entry): entry is LiveEvent => entry !== null);
}

/**
 * Subscribe to the viewer-safe event stream for one session.
 *
 * Realtime authorises with the session JWT, so the token is pushed to the
 * socket before subscribing — without a session RLS stays silent and nothing
 * private is ever delivered. Always call the returned unsubscribe on unmount.
 */
export function subscribeCreatorLive(
  sessionId: string,
  onEvent: (event: LiveEvent) => void,
): () => void {
  const supabase = client();
  const channel = supabase.channel(`creator-live:${sessionId}`);
  let disposed = false;

  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'creator_live_events',
      filter: `session_id=eq.${sessionId}`,
    },
    (payload) => {
      const event = parseLiveEventRow(payload.new);
      if (event) onEvent(event);
    },
  );

  channel.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'creator_live_sessions',
      filter: `id=eq.${sessionId}`,
    },
    (payload) => {
      const row = payload.new as { status?: unknown } | null;
      const status = row && typeof row.status === 'string' ? row.status : null;
      if (status !== 'LIVE' && status !== 'ENDED') return;
      onEvent({
        id: `session-${status}-${Date.now()}`,
        kind: status === 'LIVE' ? 'SESSION_STARTED' : 'SESSION_ENDED',
        interactionId: null,
        actionKind: null,
        payload: { status },
        createdAt: Date.now(),
      });
    },
  );

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
    } catch {
      // No session (or a transient auth read failure): subscribe anyway and let
      // RLS stay silent rather than crashing the live screen.
    }
    if (disposed) return;
    channel.subscribe();
  })();

  return () => {
    disposed = true;
    void supabase.removeChannel(channel);
  };
}

