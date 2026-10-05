/**
 * Arena game layer API (Phase 14): Call Backup, battle events, own reputation.
 *
 * Everything is server-authoritative. The client never sends a reputation
 * amount, never names a recipient's stance, and never marks a call as answered —
 * it asks, and the database decides.
 */

import { requireSupabase, requestError, SupabaseError } from './supabaseClient';
import type { Json } from '../supabase/types';
import type {
  ArenaBackupPolicy,
  ArenaBattleEventKind,
  ArenaStanding,
} from '../utils/arenaGameState';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function millis(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export interface ArenaBackupAuthor {
  id: string;
  handle: string;
  name: string;
  avatarTint: string;
}

export interface ArenaBackupCandidate {
  profileId: string;
  author: ArenaBackupAuthor | null;
  score: number;
  standing: ArenaStanding;
  reasons: string[];
}

export interface ArenaBackupInvite {
  inviteId: string;
  roomId: string;
  topicId: string;
  topicTitle: string;
  caller: ArenaBackupAuthor | null;
  status: string;
  createdAt: number | null;
  expiresAt: number | null;
  roomStatus: string;
  capacity: number;
  participantCount: number;
  acceptingDebaters: boolean;
}

export type ArenaBackupAnswer =
  | { status: 'ACCEPTED'; roomId: string; stance: string | null; participantCount: number }
  | { status: 'already_in'; roomId: string }
  | { status: 'room_full'; roomId: string; spectateAvailable: boolean }
  | { status: 'DECLINED' }
  | { status: 'EXPIRED'; reason: string | null }
  | { status: 'unknown' };

export interface ArenaBattleEvent {
  id: string;
  kind: ArenaBattleEventKind;
  actorName: string | null;
  payload: Record<string, unknown>;
  createdAt: number | null;
}

export interface ArenaRoomLoad {
  capacity: number;
  debaterCount: number;
  spectatorCount: number;
  acceptingDebaters: boolean;
  saturated: boolean;
  spectateAvailable: boolean;
  viewerIsMember: boolean;
}

export interface ArenaReputation {
  standing: ArenaStanding;
  facets: Record<string, number>;
  reputation: number;
  mayCallBackup: boolean;
  mayBeCalled: boolean;
}

function toAuthor(value: unknown): ArenaBackupAuthor | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = str(record.id);
  const handle = str(record.handle);
  if (!id || !handle) return null;
  return {
    id,
    handle,
    name: str(record.name) ?? handle,
    avatarTint: str(record.avatarTint) ?? '#A1A1AA',
  };
}

function toStanding(value: unknown): ArenaStanding {
  return value === 'VETERAN' || value === 'DEBATER' || value === 'CONTRIBUTOR'
    ? value
    : 'NEWCOMER';
}

function toReasons(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function toBackupCandidates(payload: Json | null): ArenaBackupCandidate[] {
  if (!Array.isArray(payload)) return [];
  const out: ArenaBackupCandidate[] = [];
  for (const entry of payload) {
    const record = asRecord(entry as Json);
    if (!record) continue;
    const profileId = str(record.profileId);
    if (!profileId) continue;
    out.push({
      profileId,
      author: toAuthor(record.author),
      score: num(record.score) ?? 0,
      standing: toStanding(record.standing),
      reasons: toReasons(record.reasons),
    });
  }
  return out;
}

export function toBackupInvites(payload: Json | null): ArenaBackupInvite[] {
  if (!Array.isArray(payload)) return [];
  const out: ArenaBackupInvite[] = [];
  for (const entry of payload) {
    const record = asRecord(entry as Json);
    if (!record) continue;
    const inviteId = str(record.inviteId);
    const roomId = str(record.roomId);
    if (!inviteId || !roomId) continue;
    out.push({
      inviteId,
      roomId,
      topicId: str(record.topicId) ?? '',
      topicTitle: str(record.topicTitle) ?? '',
      caller: toAuthor(record.caller),
      status: str(record.status) ?? 'PENDING',
      createdAt: millis(record.createdAt),
      expiresAt: millis(record.expiresAt),
      roomStatus: str(record.roomStatus) ?? 'OPEN',
      capacity: num(record.capacity) ?? 0,
      participantCount: num(record.participantCount) ?? 0,
      acceptingDebaters: record.acceptingDebaters === true,
    });
  }
  return out;
}

export function toBattleEvents(payload: Json | null): ArenaBattleEvent[] {
  if (!Array.isArray(payload)) return [];
  const out: ArenaBattleEvent[] = [];
  for (const entry of payload) {
    const record = asRecord(entry as Json);
    if (!record) continue;
    const id = str(record.id);
    const kind = str(record.kind);
    if (!id || !kind) continue;
    out.push({
      id,
      kind: kind as ArenaBattleEventKind,
      actorName: toAuthor(record.actor)?.name ?? null,
      payload: asRecord(record.payload) ?? {},
      createdAt: millis(record.createdAt),
    });
  }
  return out;
}

function client() {
  return requireSupabase();
}

/** Who could credibly be called into this battle, ranked by real signals. */
export async function fetchBackupCandidates(
  roomId: string,
  limit = 5,
): Promise<ArenaBackupCandidate[]> {
  const { data, error } = await client().rpc('list_arena_backup_candidates', {
    p_room_id: roomId,
    p_limit: limit,
  });
  if (error) throw requestError(error);
  return toBackupCandidates(data);
}

/** Summon someone. The server owns eligibility, cooldowns and the caps. */
export async function callBackup(roomId: string, recipientId: string): Promise<string> {
  const { data, error } = await client().rpc('call_arena_backup', {
    p_room_id: roomId,
    p_recipient_id: recipientId,
  });
  if (error) throw requestError(error);
  const inviteId = str(asRecord(data)?.inviteId);
  if (!inviteId) {
    throw new SupabaseError('call_arena_backup returned an unexpected payload', 'bad_payload');
  }
  return inviteId;
}

export async function cancelBackup(inviteId: string): Promise<void> {
  const { error } = await client().rpc('cancel_arena_backup', { p_invite_id: inviteId });
  if (error) throw requestError(error);
}

/** Answer a call. Capacity is decided by the server, not by this function. */
export async function respondBackup(
  inviteId: string,
  accept: boolean,
  stance?: 'AGREE' | 'UNSURE' | 'DISAGREE',
): Promise<ArenaBackupAnswer> {
  const { data, error } = await client().rpc('respond_arena_backup', {
    p_invite_id: inviteId,
    p_accept: accept,
    ...(accept && stance ? { p_stance: stance } : {}),
  });
  if (error) throw requestError(error);
  const record = asRecord(data);
  const status = str(record?.status);
  if (status === 'ACCEPTED') {
    return {
      status: 'ACCEPTED',
      roomId: str(record?.roomId) ?? '',
      stance: str(record?.stance),
      participantCount: num(record?.participantCount) ?? 0,
    };
  }
  if (status === 'already_in') return { status: 'already_in', roomId: str(record?.roomId) ?? '' };
  if (status === 'room_full') {
    return {
      status: 'room_full',
      roomId: str(record?.roomId) ?? '',
      spectateAvailable: record?.spectateAvailable === true,
    };
  }
  if (status === 'DECLINED') return { status: 'DECLINED' };
  if (status === 'EXPIRED') return { status: 'EXPIRED', reason: str(record?.reason) };
  return { status: 'unknown' };
}

/** Live calls addressed to the viewer. */
export async function fetchMyBackupInvites(): Promise<ArenaBackupInvite[]> {
  const { data, error } = await client().rpc('list_my_arena_backup_invites');
  if (error) throw requestError(error);
  return toBackupInvites(data);
}

export async function fetchBackupPreference(): Promise<ArenaBackupPolicy> {
  const { data, error } = await client().rpc('get_arena_backup_preference');
  if (error) throw requestError(error);
  const policy = str(asRecord(data)?.policy);
  return policy === 'FOLLOWING' || policy === 'NOBODY' ? policy : 'EVERYONE';
}

export async function setBackupPreference(policy: ArenaBackupPolicy): Promise<ArenaBackupPolicy> {
  const { data, error } = await client().rpc('set_arena_backup_preference', { p_policy: policy });
  if (error) throw requestError(error);
  const next = str(asRecord(data)?.policy);
  return next === 'FOLLOWING' || next === 'NOBODY' ? next : 'EVERYONE';
}

/** The room's stored battle moments since a cursor, oldest-first. */
export async function fetchBattleEvents(
  roomId: string,
  after?: number | null,
  limit = 30,
): Promise<ArenaBattleEvent[]> {
  const { data, error } = await client().rpc('list_arena_room_events', {
    p_room_id: roomId,
    ...(after != null ? { p_after: new Date(after).toISOString() } : {}),
    p_limit: limit,
  });
  if (error) throw requestError(error);
  return toBattleEvents(data);
}

/** Debater vs spectator load. Capacity bounds debaters only. */
export async function fetchRoomLoad(roomId: string): Promise<ArenaRoomLoad | null> {
  const { data, error } = await client().rpc('arena_room_load', { p_room_id: roomId });
  if (error) return null;
  const record = asRecord(data);
  if (!record) return null;
  return {
    capacity: num(record.capacity) ?? 0,
    debaterCount: num(record.debaterCount) ?? 0,
    spectatorCount: num(record.spectatorCount) ?? 0,
    acceptingDebaters: record.acceptingDebaters === true,
    saturated: record.saturated === true,
    spectateAvailable: record.spectateAvailable === true,
    viewerIsMember: record.viewerIsMember === true,
  };
}

/** The viewer's own standing and facets — there is no profile parameter. */
export async function fetchMyArenaReputation(): Promise<ArenaReputation | null> {
  const { data, error } = await client().rpc('get_my_arena_reputation');
  if (error) return null;
  const record = asRecord(data);
  if (!record) return null;
  const facets: Record<string, number> = {};
  const raw = asRecord(record.facets);
  if (raw) {
    for (const [key, value] of Object.entries(raw)) {
      const parsed = num(value);
      if (parsed !== null) facets[key] = parsed;
    }
  }
  return {
    standing: toStanding(record.standing),
    facets,
    reputation: num(record.reputation) ?? 0,
    mayCallBackup: record.mayCallBackup === true,
    mayBeCalled: record.mayBeCalled === true,
  };
}

