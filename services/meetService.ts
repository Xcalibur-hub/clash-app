/**
 * Meet the World — pseudonymous text matching (no video).
 * Server owns queue matching; clients never pick peers directly.
 */
import {
  MEET_INTERESTS,
  type MeetHoodId,
  type MeetMatchMode,
} from '../utils/meetModes';
import { requestError, requireSupabase, SupabaseError } from './supabaseClient';

export { MEET_INTERESTS, type MeetHoodId, type MeetMatchMode };

export interface MeetSession {
  sessionId: string;
  mode: MeetMatchMode;
  status: 'active' | 'ended';
  countryCode: string | null;
  hood: MeetHoodId | null;
  sharedInterest: string | null;
  myAlias: string;
  peerAlias: string;
  peerConnected: boolean;
  createdAt: number;
  endedAt: number | null;
  endReason: string | null;
}

export interface MeetMessage {
  id: string;
  sessionId: string;
  mine: boolean;
  body: string;
  createdAt: number;
}

export interface MeetQueueState {
  queued: boolean;
  matched: boolean;
  queueId?: string;
  mode?: MeetMatchMode;
  queuedAt?: number;
  session?: MeetSession | null;
  alreadyActive?: boolean;
}

function client() {
  return requireSupabase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function millis(value: unknown): number | null {
  if (typeof value === 'string') {
    const n = Date.parse(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toSession(value: unknown): MeetSession | null {
  const r = asRecord(value);
  if (!r) return null;
  const sessionId = str(r.sessionId);
  const mode = str(r.mode);
  if (!sessionId || !mode) return null;
  if (
    mode !== 'ANYWHERE' &&
    mode !== 'COUNTRY' &&
    mode !== 'INTERESTS' &&
    mode !== 'HOOD'
  ) {
    return null;
  }
  const hoodRaw = str(r.hood);
  const hood =
    hoodRaw === 'techtakes' ||
    hoodRaw === 'campushustle' ||
    hoodRaw === 'goatalk' ||
    hoodRaw === 'movies' ||
    hoodRaw === 'gaming' ||
    hoodRaw === 'startups' ||
    hoodRaw === 'football'
      ? hoodRaw
      : null;

  return {
    sessionId,
    mode,
    status: str(r.status) === 'ended' ? 'ended' : 'active',
    countryCode: str(r.countryCode),
    hood,
    sharedInterest: str(r.sharedInterest),
    myAlias: str(r.myAlias) ?? 'Stranger',
    peerAlias: str(r.peerAlias) ?? 'Stranger',
    peerConnected: bool(r.peerConnected),
    createdAt: millis(r.createdAt) ?? Date.now(),
    endedAt: millis(r.endedAt),
    endReason: str(r.endReason),
  };
}

function toQueueState(value: unknown): MeetQueueState {
  const r = asRecord(value) ?? {};
  const mode = str(r.mode);
  return {
    queued: bool(r.queued),
    matched: bool(r.matched),
    queueId: str(r.queueId) ?? undefined,
    mode:
      mode === 'ANYWHERE' || mode === 'COUNTRY' || mode === 'INTERESTS' || mode === 'HOOD'
        ? mode
        : undefined,
    queuedAt: millis(r.queuedAt) ?? undefined,
    session: toSession(r.session),
    alreadyActive: bool(r.alreadyActive),
  };
}

export async function joinMeetQueue(input: {
  mode: MeetMatchMode;
  countryCode?: string | null;
  hood?: MeetHoodId | null;
  interests?: string[];
}): Promise<MeetQueueState> {
  const { data, error } = await client().rpc('join_meet_queue', {
    p_mode: input.mode,
    p_country_code: input.countryCode ?? undefined,
    p_hood: input.hood ?? undefined,
    p_interests: input.interests ?? [],
  });
  if (error) throw requestError(error);
  return toQueueState(data);
}

export async function pollMeetQueue(): Promise<MeetQueueState> {
  const { data, error } = await client().rpc('poll_meet_queue');
  if (error) throw requestError(error);
  return toQueueState(data);
}

export async function leaveMeetQueue(): Promise<void> {
  const { error } = await client().rpc('leave_meet_queue');
  if (error) throw requestError(error);
}

export async function fetchMeetSession(sessionId: string): Promise<MeetSession> {
  const { data, error } = await client().rpc('get_meet_session', {
    p_session_id: sessionId,
  });
  if (error) throw requestError(error);
  const session = toSession(data);
  if (!session) throw new SupabaseError('Meet session unavailable', 'bad_payload');
  return session;
}

export async function sendMeetMessage(sessionId: string, body: string): Promise<MeetMessage> {
  const { data, error } = await client().rpc('send_meet_message', {
    p_session_id: sessionId,
    p_body: body,
  });
  if (error) throw requestError(error);
  const r = asRecord(data);
  const id = str(r?.id);
  const createdAt = millis(r?.createdAt);
  if (!id || createdAt == null) throw new SupabaseError('Message failed', 'bad_payload');
  return {
    id,
    sessionId: str(r?.sessionId) ?? sessionId,
    mine: true,
    body: str(r?.body) ?? body,
    createdAt,
  };
}

export async function listMeetMessages(
  sessionId: string,
  limit = 40,
  before?: number | null,
): Promise<MeetMessage[]> {
  const { data, error } = await client().rpc('list_meet_messages', {
    p_session_id: sessionId,
    p_limit: limit,
    p_before: before ? new Date(before).toISOString() : undefined,
  });
  if (error) throw requestError(error);
  const r = asRecord(data);
  const items = Array.isArray(r?.items) ? r!.items : [];
  const out: MeetMessage[] = [];
  for (const row of items) {
    const m = asRecord(row);
    if (!m) continue;
    const id = str(m.id);
    const createdAt = millis(m.createdAt);
    const body = str(m.body);
    if (!id || createdAt == null || !body) continue;
    out.push({
      id,
      sessionId: str(m.sessionId) ?? sessionId,
      mine: bool(m.mine),
      body,
      createdAt,
    });
  }
  return out;
}

export async function leaveMeetSession(sessionId: string, reason = 'leave'): Promise<void> {
  const { error } = await client().rpc('leave_meet_session', {
    p_session_id: sessionId,
    p_reason: reason,
  });
  if (error) throw requestError(error);
}

export async function nextMeet(
  sessionId: string,
  input: {
    mode: MeetMatchMode;
    countryCode?: string | null;
    hood?: MeetHoodId | null;
    interests?: string[];
  },
): Promise<MeetQueueState> {
  const { data, error } = await client().rpc('next_meet', {
    p_session_id: sessionId,
    p_mode: input.mode,
    p_country_code: input.countryCode ?? undefined,
    p_hood: input.hood ?? undefined,
    p_interests: input.interests ?? [],
  });
  if (error) throw requestError(error);
  return toQueueState(data);
}

export async function blockMeetPeer(sessionId: string): Promise<void> {
  const { error } = await client().rpc('block_meet_peer', { p_session_id: sessionId });
  if (error) throw requestError(error);
}

export async function reportMeetSession(
  sessionId: string,
  reason: 'spam' | 'harassment' | 'hate' | 'sexual' | 'violence' | 'other',
  detail?: string,
): Promise<void> {
  const { error } = await client().rpc('report_meet_session', {
    p_session_id: sessionId,
    p_reason: reason,
    p_detail: detail ?? undefined,
  });
  if (error) throw requestError(error);
}

/** Poll messages (no Realtime row payloads — avoids exposing peer profile ids). */
export function pollMeetMessages(
  sessionId: string,
  onBatch: (messages: MeetMessage[]) => void,
  intervalMs = 2200,
): () => void {
  let alive = true;
  const tick = () => {
    if (!alive) return;
    void listMeetMessages(sessionId, 40)
      .then((items) => {
        if (alive) onBatch(items);
      })
      .catch(() => undefined);
  };
  tick();
  const id = setInterval(tick, intervalMs);
  return () => {
    alive = false;
    clearInterval(id);
  };
}

export function subscribeMeetTyping(
  sessionId: string,
  onPeers: (typing: boolean) => void,
): {
  broadcast: () => void;
  clear: () => void;
  unsubscribe: () => void;
} {
  const channel = client().channel(`meet-typing:${sessionId}`, {
    config: { presence: { key: 'typing' } },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const keys = Object.keys(state);
      onPeers(keys.length > 1);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ t: Date.now() });
      }
    });

  let last = 0;
  return {
    broadcast: () => {
      const now = Date.now();
      if (now - last < 2000) return;
      last = now;
      void channel.track({ t: now });
    },
    clear: () => {
      void channel.untrack();
    },
    unsubscribe: () => {
      void client().removeChannel(channel);
    },
  };
}
