import { assertReleaseAdmission } from '../utils/releaseScope';
import type { PostgrestError } from '@supabase/supabase-js';
/**
 * Interactive Creator Live API (Phase 15.4).
 *
 * Screens never touch `creator_live_*` tables directly. Lifecycle, tallies,
 * results and triggered actions are computed server-side; this module only
 * submits viewer intent and subscribes to the viewer-safe event stream.
 *
 * Realtime invalidates reads. Reconnect uses authoritative snapshots; the
 * timestamp-only events_since endpoint is not a lossless recovery contract.
 */

import type { LiveEvent } from '../utils/creatorLiveEvents';
import type { LiveActionKind, LiveInteractionType } from '../utils/creatorLiveState';
import { getPublicMediaUrl } from './mediaService';
import { currentUserId, requestError, requireSupabase, SupabaseError } from './supabaseClient';
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

export interface CreatorLiveReadSnapshot {
  session: CreatorLiveSession;
  interactions: CreatorLiveInteraction[];
  source: 'snapshot' | 'legacy';
  interactionWindowComplete: boolean;
}

function liveReadRequest<T>(request: PromiseLike<T>, signal?: AbortSignal): PromiseLike<T> {
  const builder = request as PromiseLike<T> & { abortSignal?: (signal: AbortSignal) => PromiseLike<T> };
  return signal && builder.abortSignal ? builder.abortSignal(signal) : request;
}

function checkedLiveRead(sessionId: string, rawSession: unknown, rawInteractions: unknown, source: 'snapshot' | 'legacy', complete = false): CreatorLiveReadSnapshot | null {
  if (rawSession === null) return null;
  const session = parseCreatorLiveSession(rawSession);
  const raw = rawSession as Record<string, unknown> | null;
  if (!session || session.id !== sessionId || !['SCHEDULED','LIVE','ENDED','CANCELLED'].includes(String(raw?.status))
    || typeof raw?.viewerAccess !== 'boolean') throw new SupabaseError('Invalid session identity/state', 'bad_payload');
  if (!session.viewerAccess) return null;
  const interactions = parseCreatorLiveInteractionList(rawInteractions);
  if (!Array.isArray(rawInteractions) || interactions.length !== rawInteractions.length
    || interactions.some(item => item.sessionId !== sessionId)
    || new Set(interactions.map(item => item.id)).size !== interactions.length
    || rawInteractions.some(item => !item || !['OPEN','CLOSED','CANCELLED','TRIGGERED'].includes(item.status)
      || !['POLL','CHOICE','CROWD_ACTION','GAME_ACTION'].includes(item.type)
      || !Number.isInteger(item.totalVotes) || item.totalVotes < 0
      || !item.tallies || typeof item.tallies !== 'object' || Array.isArray(item.tallies)
      || Object.values(item.tallies).some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0))) {
    throw new SupabaseError('Invalid interaction identity/state', 'bad_payload');
  }
  // Legacy visibility booleans predate the approved-continuation contract.
  if (source === 'legacy') {
    session.canParticipate = false;
    for (const item of interactions) item.canParticipate = false;
  }
  return { session, interactions, source, interactionWindowComplete: complete };
}

/** Probe the unapplied contract; only an exact missing-function response allows legacy reads. */
export async function fetchCreatorLiveReadSnapshot(sessionId: string, accountId: string | null, signal?: AbortSignal): Promise<CreatorLiveReadSnapshot | null> {
  const checkAccount = async (): Promise<void> => {
    if (signal?.aborted) throw new SupabaseError('Live read cancelled', 'read_cancelled');
    if (await currentUserId() !== accountId) throw new SupabaseError('Account changed', 'account_changed');
    if (signal?.aborted) throw new SupabaseError('Live read cancelled', 'read_cancelled');
  };
  await checkAccount();
  // Local proposed RPC typing only; do not claim generated/deployed schema support.
  const proposed = requireSupabase() as unknown as { rpc: (name: 'get_creator_live_snapshot', args: { p_session_id: string }) => PromiseLike<{
    data: unknown; error: PostgrestError | null;
  }> };
  const read = await liveReadRequest(proposed.rpc('get_creator_live_snapshot', { p_session_id: sessionId }), signal);
  await checkAccount();
  if (!read.error) {
    if (read.data === null) return null;
    if (typeof read.data !== 'object' || Array.isArray(read.data)) throw new SupabaseError('Invalid snapshot payload', 'bad_payload');
    const data = read.data as Record<string, unknown>;
    if (!('session' in data) || !Array.isArray(data.interactions) || typeof data.interactionWindowComplete !== 'boolean')
      throw new SupabaseError('Invalid snapshot payload', 'bad_payload');
    return checkedLiveRead(sessionId, data.session, data.interactions, 'snapshot', data.interactionWindowComplete);
  }
  if (read.error.code !== 'PGRST202' || !read.error.message.includes('get_creator_live_snapshot')) throw requestError(read.error);
  const sessionRead = await liveReadRequest(requireSupabase().rpc('get_creator_live_session', { p_session_id: sessionId }), signal);
  await checkAccount();
  if (sessionRead.error) throw requestError(sessionRead.error);
  if (sessionRead.data === null) return null;
  // Validate session before any follow-up read, preserving X1's fail-closed contract.
  const session = checkedLiveRead(sessionId, sessionRead.data, [], 'legacy');
  if (!session) return null;
  const interactionRead = await liveReadRequest(requireSupabase().rpc('list_creator_live_interactions', { p_session_id: sessionId, p_limit: 20 }), signal);
  await checkAccount();
  if (interactionRead.error) throw requestError(interactionRead.error);
  return checkedLiveRead(sessionId, sessionRead.data, interactionRead.data, 'legacy');
}

export async function createCreatorLiveSession(input: CreateLiveSessionInput): Promise<string> {
  assertReleaseAdmission('live');
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
  assertReleaseAdmission('live');
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
  const result = created.find(item => item.id === id);
  if (!result) throw new SupabaseError('Created interaction unavailable; refresh before continuing.', 'unknown_result');
  return result;
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
  signal?: AbortSignal,
): Promise<CreatorLiveVoteResult> {
  if (signal?.aborted) throw new SupabaseError('Vote request cancelled; outcome unknown.', 'request_cancelled');
  const { data, error } = await liveReadRequest(requireSupabase().rpc('submit_creator_live_vote', {
    p_interaction_id: interactionId,
    p_option_id: optionId ?? undefined,
  }), signal);
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

/** Legacy timestamp-window inspection only; not lossless reconnect recovery. */
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
 * Supply the current Auth session before subscribing. Deployed grants, RLS
 * and publication still require independent acceptance. Always dispose on unmount.
 */
export function subscribeCreatorLive(
  sessionId: string,
  onEvent: (event: LiveEvent) => void,
  options: { isCurrent?: () => boolean; onStatus?: (status: string) => void } = {},
): () => void {
  const supabase = client();
  const channel = supabase.channel(`creator-live:${sessionId}`);
  let disposed = false;
  const active = (): boolean => !disposed && (options.isCurrent?.() ?? true);
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    void Promise.resolve(supabase.removeChannel(channel)).catch(() => undefined);
  };

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
      if (active() && event && (payload.new as { session_id?: unknown }).session_id === sessionId) onEvent(event);
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
      if (!active() || (payload.new as { id?: unknown })?.id !== sessionId) return;
      if (status !== 'LIVE' && status !== 'ENDED' && status !== 'CANCELLED') return;
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
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!active()) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
    } catch {
      if (active()) options.onStatus?.('CHANNEL_ERROR');
      dispose();
      return;
    }
    if (!active()) return;
    channel.subscribe(status => {
      if (!active()) return;
      options.onStatus?.(status);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') dispose();
    });
  })();

  return dispose;
}

