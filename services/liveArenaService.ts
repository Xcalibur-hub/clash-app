/**
 * Live Daily Arena API (Phase 13).
 *
 * One Topic a day. People join with a private stance, land in a capacity-bounded
 * Room, argue in a realtime thread, cite evidence, then judge. Every phase gate,
 * tally and reward lives in the database — this module is a typed shell around
 * the RPCs and does not compute a single product rule.
 *
 * Two invariants worth repeating at the call site:
 *
 *   · A stance is private, forever. No payload here exposes how the room splits
 *     before settlement, so a screen physically cannot render a bandwagon
 *     percentage. `viewerStance` is the viewer's own row and nothing else.
 *   · There are no client writes. Every mutation is a SECURITY DEFINER RPC that
 *     resolves the actor from the session; none of them accepts a profile id.
 *
 * Payload shapes come from the SQL builders (`arena_topic_payload`,
 * `arena_room_payload`, `arena_message_payload`, `arena_evidence_payload`,
 * `arena_result_payload`), which already emit camelCase JSON — the mappers below
 * validate it rather than rename it.
 */

import type { Json } from '../supabase/types';
import type { MediaKind } from '../store/types';
import type { Stance } from './mindshiftService';
import {
  completeUpload,
  createUpload,
  failUpload,
  getPublicMediaUrl,
  readPickedBytes,
  uploadFile,
} from './mediaService';
import { requestError, requireSupabase, SupabaseError } from './supabaseClient';

export type { Stance } from './mindshiftService';

// ── Vocabulary (mirrors the database enums) ─────────────────────────────────

export type ArenaTopicStatus = 'scheduled' | 'live' | 'closed';
/** Derived from the topic clock by `arena_topic_phase`, never from a device clock. */
export type ArenaPhase = 'scheduled' | 'open' | 'final_arguments' | 'judging' | 'closed';
export type ArenaRoomStatus = 'OPEN' | 'FINAL_ARGUMENTS' | 'JUDGING' | 'SETTLED' | 'CANCELLED';
export type ArenaParticipantRole = 'debater' | 'spectator';
export type ArenaMessageKind = 'text' | 'media' | 'gif' | 'system';
export type ArenaEvidenceKind = 'image' | 'video' | 'link';
/** DRAW is a result (tie, or nobody voted), never a ballot. */
export type ArenaWinningSide = 'AGREE' | 'DISAGREE' | 'DRAW';

/** The longest argument the server will accept (`arena_room_messages` check). */
export const ARENA_MESSAGE_MAX = 500;
/** The longest evidence title the server will accept. */
export const ARENA_EVIDENCE_TITLE_MAX = 140;

// ── Domain types ────────────────────────────────────────────────────────────

/** Compact author card — the same shape everywhere a profile appears. */
export interface ArenaAuthor {
  id: string;
  handle: string;
  name: string;
  avatarTint: string;
  rank: string;
}

export interface LiveArenaTopic {
  id: string;
  title: string;
  description: string | null;
  hood: string | null;
  status: ArenaTopicStatus;
  phase: ArenaPhase;
  opensAt: number;
  finalArgumentsAt: number;
  judgingAt: number;
  closesAt: number;
  createdAt: number;
  /** Real total across every room on this topic. Never a decorated number. */
  participantCount: number;
  activeRoomCount: number;
  secondsRemaining: number;
  viewerJoined: boolean;
  viewerRoomId: string | null;
  viewerRoomStatus: ArenaRoomStatus | null;
  /** The viewer's OWN stance. The room's split is never returned. */
  viewerStance: Stance | null;
  viewerFinalStance: Stance | null;
  viewerRole: ArenaParticipantRole | null;
}

/** One public argument snippet for Arena home — no stance, no room id. */
export interface LiveArgumentExcerpt {
  id: string;
  text: string;
  kind: string;
  gifUrl: string | null;
  createdAt: number;
  handle: string;
  name: string;
  avatarTint: string;
}

export interface LiveTopicPresence {
  handle: string;
  name: string;
  avatarTint: string;
}

export interface LiveReactionSignal {
  emoji: string;
  count: number;
}

export interface LiveTopicPreview {
  topicId: string;
  excerpts: LiveArgumentExcerpt[];
  presence: LiveTopicPresence[];
  reactionSignals: LiveReactionSignal[];
}

export interface ArenaJoinResult {
  /** False when the membership already existed — joining is idempotent. */
  joined: boolean;
  roomId: string;
  topicId: string;
  /** Null for spectators — they never record a private stance. */
  stance: Stance | null;
  role: ArenaParticipantRole;
  status: ArenaRoomStatus;
  capacity: number;
  participantCount: number;
  joinedAt: number;
}

export interface ArenaRoomViewer {
  isMember: true;
  role: ArenaParticipantRole;
  /** Null for spectators. */
  stance: Stance | null;
  finalStance: Stance | null;
  finalRecordedAt: number | null;
  joinedAt: number;
  hasSideVote: boolean;
  hasArgumentVote: boolean;
}

export interface ArenaRoomTopic {
  id: string;
  title: string;
  description: string | null;
  hood: string | null;
  status: ArenaTopicStatus;
  opensAt: number;
  finalArgumentsAt: number;
  judgingAt: number;
  closesAt: number;
}

export interface ArenaResult {
  roomId: string;
  winningSide: ArenaWinningSide;
  agreeVotes: number;
  disagreeVotes: number;
  participantCount: number;
  mindshiftChangedCount: number;
  mindshiftCompletedCount: number;
  /** Null when nobody completed a pair — not the same as 0% movement. */
  mindshiftChangedPercent: number | null;
  settledAt: number;
  bestArgumentMessageId: string | null;
  bestArgumentAuthor: ArenaAuthor | null;
  bestArgumentBody: string | null;
}

export interface ArenaRoom {
  roomId: string;
  topicId: string;
  status: ArenaRoomStatus;
  capacity: number;
  participantCount: number;
  opensAt: number;
  closesAt: number;
  createdAt: number;
  phase: ArenaPhase;
  secondsRemaining: number;
  secondsToFinalArguments: number;
  secondsToJudging: number;
  topic: ArenaRoomTopic;
  /** Null for a non-member: a membership is only ever visible to its owner. */
  viewer: ArenaRoomViewer | null;
  /** Only present once the room is SETTLED — the one public tally surface. */
  result: ArenaResult | null;
}

export interface ArenaReaction {
  emoji: string;
  count: number;
  viewerReacted: boolean;
}

export interface ArenaMessage {
  id: string;
  roomId: string;
  kind: ArenaMessageKind;
  body: string;
  parentMessageId: string | null;
  createdAt: number;
  mediaUrl: string | null;
  mediaKind: MediaKind | null;
  gifProvider: string | null;
  gifExternalId: string | null;
  isOwn: boolean;
  author: ArenaAuthor | null;
  reactions: ArenaReaction[];
  /** Visible reply children (server count). */
  replyCount: number;
  /** Withheld (null) until the room settles — a live count is a bandwagon signal. */
  argumentVotes: number | null;
  /** True while an optimistic send is still in flight. Never set by the server. */
  pending?: boolean;
}

export type ArenaPulseCategory =
  | 'TOP_ARGUMENT'
  | 'BEST_EVIDENCE'
  | 'BEST_REBUTTAL'
  | 'FAST_RISING'
  | 'CROWD_FAVORITE';

export interface ArenaPulseLeader {
  category: ArenaPulseCategory;
  label: string;
  messageId: string | null;
  evidenceId: string | null;
  author: ArenaAuthor | null;
  score: number;
  preview: string;
}

export interface ArenaRoomPulse {
  roomId: string;
  status: ArenaRoomStatus;
  leaders: ArenaPulseLeader[];
  generatedAt: number;
}

/** Ephemeral typing presence — never persisted, never includes draft text. */
export interface ArenaTypingState {
  userId: string;
  handle: string;
  name: string;
  avatarTint: string;
  replyingToMessageId: string | null;
  typing: true;
}

export interface ArenaEvidence {
  id: string;
  roomId: string;
  topicId: string;
  messageId: string | null;
  kind: ArenaEvidenceKind;
  title: string;
  sourceUrl: string | null;
  mediaUrl: string | null;
  usefulCount: number;
  createdAt: number;
  isOwn: boolean;
  author: ArenaAuthor | null;
  viewerMarkedUseful: boolean;
}

export interface ArenaReactionResult {
  messageId: string;
  emoji: string;
  reacted: boolean;
  count: number;
}

export interface ArenaEvidenceMarkResult {
  evidenceId: string;
  marked: boolean;
  usefulCount: number;
}

export interface ArenaSideVoteResult {
  roomId: string;
  side: ArenaWinningSide;
  recorded: boolean;
}

export interface ArenaArgumentVoteResult {
  roomId: string;
  messageId: string;
  recorded: boolean;
}

export interface ArenaFinalStanceResult {
  roomId: string;
  initialStance: Stance;
  finalStance: Stance;
  finalRecordedAt: number | null;
  changed: boolean;
}

export interface ArenaMindshiftStats {
  roomId: string;
  totalInitialParticipants: number;
  completedParticipants: number;
  changedCount: number;
  /** Null when nobody completed a pair. */
  changedPercent: number | null;
}

/** An owned, ready, public upload already attached to a message or citation. */
export interface ArenaMediaAttachment {
  mediaObjectId: string;
  url: string;
  kind: 'image' | 'video';
}

/** A validated Tenor GIF (no storage upload — the URL host is allowlisted server-side). */
export interface ArenaGifAttachment {
  provider: 'tenor';
  externalId: string;
  url: string;
}

// ── Payload readers ─────────────────────────────────────────────────────────

type Record_ = { [key: string]: Json | undefined };

function asRecord(value: Json | null | undefined): Record_ | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record_;
  }
  return null;
}

function str(value: Json | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function num(value: Json | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: Json | undefined): boolean {
  return value === true;
}

/** Postgres timestamptz → epoch millis. Null for absent or unparseable values. */
function millis(value: Json | undefined): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function bad(what: string): never {
  throw new SupabaseError(`${what} returned an unexpected payload`, 'bad_payload');
}

function oneOf<T extends string>(value: Json | undefined, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

const STANCES: readonly Stance[] = ['AGREE', 'UNSURE', 'DISAGREE'];
const TOPIC_STATUSES: readonly ArenaTopicStatus[] = ['scheduled', 'live', 'closed'];
const PHASES: readonly ArenaPhase[] = ['scheduled', 'open', 'final_arguments', 'judging', 'closed'];
const ROOM_STATUSES: readonly ArenaRoomStatus[] = [
  'OPEN',
  'FINAL_ARGUMENTS',
  'JUDGING',
  'SETTLED',
  'CANCELLED',
];
const ROLES: readonly ArenaParticipantRole[] = ['debater', 'spectator'];
const MESSAGE_KINDS: readonly ArenaMessageKind[] = ['text', 'media', 'gif', 'system'];
const EVIDENCE_KINDS: readonly ArenaEvidenceKind[] = ['image', 'video', 'link'];
const SIDES: readonly ArenaWinningSide[] = ['AGREE', 'DISAGREE', 'DRAW'];
const MEDIA_KINDS: readonly MediaKind[] = ['image', 'video', 'gif'];

function toAuthor(value: Json | undefined): ArenaAuthor | null {
  const record = asRecord(value ?? null);
  if (!record) return null;
  const id = str(record.id);
  const handle = str(record.handle);
  if (!id || !handle) return null;
  return {
    id,
    handle,
    name: str(record.name) ?? handle,
    avatarTint: str(record.avatarTint) ?? '#A1A1AA',
    rank: str(record.rank) ?? 'Rookie',
  };
}

function toTopic(payload: Json | null): LiveArenaTopic {
  const record = asRecord(payload);
  if (!record) bad('arena topic');
  const id = str(record.id);
  const title = str(record.title);
  const status = oneOf(record.status, TOPIC_STATUSES);
  const phase = oneOf(record.phase, PHASES);
  const closesAt = millis(record.closesAt);
  if (!id || !title || !status || !phase || closesAt === null) bad('arena topic');
  return {
    id,
    title,
    description: str(record.description),
    hood: str(record.hood),
    status,
    phase,
    opensAt: millis(record.opensAt) ?? closesAt,
    finalArgumentsAt: millis(record.finalArgumentsAt) ?? closesAt,
    judgingAt: millis(record.judgingAt) ?? closesAt,
    closesAt,
    createdAt: millis(record.createdAt) ?? closesAt,
    participantCount: num(record.participantCount) ?? 0,
    activeRoomCount: num(record.activeRoomCount) ?? 0,
    secondsRemaining: num(record.secondsRemaining) ?? 0,
    viewerJoined: bool(record.viewerJoined),
    viewerRoomId: str(record.viewerRoomId),
    viewerRoomStatus: oneOf(record.viewerRoomStatus, ROOM_STATUSES),
    viewerStance: oneOf(record.viewerStance, STANCES),
    viewerFinalStance: oneOf(record.viewerFinalStance, STANCES),
    viewerRole: oneOf(record.viewerRole, ROLES),
  };
}

function toResult(value: Json | undefined): ArenaResult | null {
  const record = asRecord(value ?? null);
  if (!record) return null;
  const roomId = str(record.roomId);
  const winningSide = oneOf(record.winningSide, SIDES);
  if (!roomId || !winningSide) return null;
  return {
    roomId,
    winningSide,
    agreeVotes: num(record.agreeVotes) ?? 0,
    disagreeVotes: num(record.disagreeVotes) ?? 0,
    participantCount: num(record.participantCount) ?? 0,
    mindshiftChangedCount: num(record.mindshiftChangedCount) ?? 0,
    mindshiftCompletedCount: num(record.mindshiftCompletedCount) ?? 0,
    mindshiftChangedPercent: num(record.mindshiftChangedPercent),
    settledAt: millis(record.settledAt) ?? Date.now(),
    bestArgumentMessageId: str(record.bestArgumentMessageId),
    bestArgumentAuthor: toAuthor(record.bestArgumentAuthor),
    bestArgumentBody: str(record.bestArgumentBody),
  };
}

function toRoomViewer(value: Json | undefined): ArenaRoomViewer | null {
  const record = asRecord(value ?? null);
  if (!record) return null;
  const role = oneOf(record.role, ROLES) ?? 'debater';
  const stance = oneOf(record.stance, STANCES);
  // Spectators have no stance; debaters must have one.
  if (role === 'debater' && !stance) return null;
  return {
    isMember: true,
    role,
    stance: stance ?? null,
    finalStance: oneOf(record.finalStance, STANCES),
    finalRecordedAt: millis(record.finalRecordedAt),
    joinedAt: millis(record.joinedAt) ?? Date.now(),
    hasSideVote: bool(record.hasSideVote),
    hasArgumentVote: bool(record.hasArgumentVote),
  };
}

function toRoom(payload: Json | null): ArenaRoom {
  const record = asRecord(payload);
  if (!record) bad('get_arena_room');
  const roomId = str(record.roomId);
  const topicId = str(record.topicId);
  const status = oneOf(record.status, ROOM_STATUSES);
  const phase = oneOf(record.phase, PHASES);
  const closesAt = millis(record.closesAt);
  const topicRecord = asRecord(record.topic ?? null);
  if (!roomId || !topicId || !status || !phase || closesAt === null || !topicRecord) {
    bad('get_arena_room');
  }
  const topicClosesAt = millis(topicRecord.closesAt) ?? closesAt;
  return {
    roomId,
    topicId,
    status,
    capacity: num(record.capacity) ?? 0,
    participantCount: num(record.participantCount) ?? 0,
    opensAt: millis(record.opensAt) ?? closesAt,
    closesAt,
    createdAt: millis(record.createdAt) ?? closesAt,
    phase,
    secondsRemaining: num(record.secondsRemaining) ?? 0,
    secondsToFinalArguments: num(record.secondsToFinalArguments) ?? 0,
    secondsToJudging: num(record.secondsToJudging) ?? 0,
    topic: {
      id: str(topicRecord.id) ?? topicId,
      title: str(topicRecord.title) ?? '',
      description: str(topicRecord.description),
      hood: str(topicRecord.hood),
      status: oneOf(topicRecord.status, TOPIC_STATUSES) ?? 'live',
      opensAt: millis(topicRecord.opensAt) ?? topicClosesAt,
      finalArgumentsAt: millis(topicRecord.finalArgumentsAt) ?? topicClosesAt,
      judgingAt: millis(topicRecord.judgingAt) ?? topicClosesAt,
      closesAt: topicClosesAt,
    },
    viewer: toRoomViewer(record.viewer),
    result: toResult(record.result),
  };
}

function toReactions(value: Json | undefined): ArenaReaction[] {
  if (!Array.isArray(value)) return [];
  const out: ArenaReaction[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const emoji = record ? str(record.emoji) : null;
    if (!record || !emoji) continue;
    out.push({
      emoji,
      count: num(record.count) ?? 0,
      viewerReacted: bool(record.viewerReacted),
    });
  }
  return out;
}

function toMessage(payload: Json | null): ArenaMessage {
  const record = asRecord(payload);
  if (!record) bad('arena message');
  const id = str(record.id);
  const roomId = str(record.roomId);
  const createdAt = millis(record.createdAt);
  if (!id || !roomId || createdAt === null) bad('arena message');
  return {
    id,
    roomId,
    kind: oneOf(record.kind, MESSAGE_KINDS) ?? 'text',
    body: str(record.body) ?? '',
    parentMessageId: str(record.parentMessageId),
    createdAt,
    mediaUrl: str(record.mediaUrl),
    mediaKind: oneOf(record.mediaKind, MEDIA_KINDS),
    gifProvider: str(record.gifProvider),
    gifExternalId: str(record.gifExternalId),
    isOwn: bool(record.isOwn),
    author: toAuthor(record.author),
    reactions: toReactions(record.reactions),
    replyCount: num(record.replyCount) ?? 0,
    argumentVotes: num(record.argumentVotes),
  };
}

function toEvidence(payload: Json | null): ArenaEvidence {
  const record = asRecord(payload);
  if (!record) bad('arena evidence');
  const id = str(record.id);
  const roomId = str(record.roomId);
  const title = str(record.title);
  const kind = oneOf(record.kind, EVIDENCE_KINDS);
  if (!id || !roomId || !title || !kind) bad('arena evidence');
  return {
    id,
    roomId,
    topicId: str(record.topicId) ?? '',
    messageId: str(record.messageId),
    kind,
    title,
    sourceUrl: str(record.sourceUrl),
    mediaUrl: str(record.mediaUrl),
    usefulCount: num(record.usefulCount) ?? 0,
    createdAt: millis(record.createdAt) ?? Date.now(),
    isOwn: bool(record.isOwn),
    author: toAuthor(record.author),
    viewerMarkedUseful: bool(record.viewerMarkedUseful),
  };
}

function client() {
  return requireSupabase();
}

// ── Topics ──────────────────────────────────────────────────────────────────

/** Every topic live right now, soonest deadline first. Guest-safe (viewer fields null). */
export async function fetchLiveTopics(): Promise<LiveArenaTopic[]> {
  const { data, error } = await client().rpc('list_live_arena_topics');
  if (error) throw requestError(error);
  return (data ?? []).map(toTopic);
}

/**
 * Bounded live argument + presence preview for one topic card.
 * SECURITY DEFINER; respects blocks/mutes/hidden. No room subscription.
 */
export async function fetchTopicLivePreview(topicId: string): Promise<LiveTopicPreview> {
  const { data, error } = await client().rpc('list_live_arena_topic_previews', {
    p_topic_id: topicId,
    p_limit: 4,
  });
  if (error) throw requestError(error);
  return toTopicPreview(data);
}

function toTopicPreview(payload: Json | null): LiveTopicPreview {
  const record = asRecord(payload);
  if (!record) {
    return { topicId: '', excerpts: [], presence: [], reactionSignals: [] };
  }
  const excerptsRaw = Array.isArray(record.excerpts) ? record.excerpts : [];
  const presenceRaw = Array.isArray(record.presence) ? record.presence : [];
  const signalsRaw = Array.isArray(record.reactionSignals) ? record.reactionSignals : [];

  const excerpts: LiveArgumentExcerpt[] = [];
  for (const item of excerptsRaw) {
    const row = asRecord(item as Json);
    if (!row) continue;
    const id = str(row.id);
    const handle = str(row.handle);
    if (!id || !handle) continue;
    excerpts.push({
      id,
      text: str(row.text) ?? '',
      kind: str(row.kind) ?? 'text',
      gifUrl: str(row.gifUrl),
      createdAt: millis(row.createdAt) ?? Date.now(),
      handle,
      name: str(row.name) ?? handle,
      avatarTint: str(row.avatarTint) ?? '#A1A1AA',
    });
  }

  const presence: LiveTopicPresence[] = [];
  for (const item of presenceRaw) {
    const row = asRecord(item as Json);
    if (!row) continue;
    const handle = str(row.handle);
    if (!handle) continue;
    presence.push({
      handle,
      name: str(row.name) ?? handle,
      avatarTint: str(row.avatarTint) ?? '#A1A1AA',
    });
  }

  const reactionSignals: LiveReactionSignal[] = [];
  for (const item of signalsRaw) {
    const row = asRecord(item as Json);
    if (!row) continue;
    const emoji = str(row.emoji);
    const count = num(row.count);
    if (!emoji || count == null || count <= 0) continue;
    reactionSignals.push({ emoji, count });
  }

  return {
    topicId: str(record.topicId) ?? '',
    excerpts,
    presence,
    reactionSignals,
  };
}

/** One topic card. Scheduled topics are staff-only and raise server-side. */
export async function fetchTopic(topicId: string): Promise<LiveArenaTopic> {
  const { data, error } = await client().rpc('get_arena_topic', { p_topic_id: topicId });
  if (error) throw requestError(error);
  return toTopic(data);
}

/** Public room card for topic discovery — capacity/presence only, never stance splits. */
export interface ArenaTopicRoomCard {
  roomId: string;
  roomIndex: number;
  status: ArenaRoomStatus;
  capacity: number;
  participantCount: number;
  opensAt: number;
  closesAt: number;
  isViewerRoom: boolean;
}

/** Active rooms on a topic, ordered by creation (Room 1, Room 2, …). */
export async function fetchTopicRooms(topicId: string): Promise<ArenaTopicRoomCard[]> {
  const { data, error } = await client().rpc('list_arena_topic_rooms', { p_topic_id: topicId });
  if (error) throw requestError(error);
  const record = asRecord(data);
  const rooms = record?.rooms;
  if (!Array.isArray(rooms)) return [];
  const out: ArenaTopicRoomCard[] = [];
  for (const item of rooms) {
    const row = asRecord(item);
    if (!row) continue;
    const roomId = str(row.roomId);
    const status = oneOf(row.status, ROOM_STATUSES);
    if (!roomId || !status) continue;
    out.push({
      roomId,
      roomIndex: num(row.roomIndex) ?? out.length + 1,
      status,
      capacity: num(row.capacity) ?? 0,
      participantCount: num(row.participantCount) ?? 0,
      opensAt: millis(row.opensAt) ?? 0,
      closesAt: millis(row.closesAt) ?? 0,
      isViewerRoom: bool(row.isViewerRoom),
    });
  }
  return out;
}

/**
 * Enter a specific room as a spectator (or move an existing spectator membership).
 * Debaters already assigned elsewhere are refused by the server (P0006).
 * Never increments capacity.
 */
/** Room member for presence strip — never includes stance. */
export interface ArenaRoomPresence extends ArenaAuthor {
  isViewer: boolean;
}

/** Members currently in the room (membership-gated). No stance fields. */
export async function fetchRoomPresence(
  roomId: string,
  limit = 12,
): Promise<ArenaRoomPresence[]> {
  const { data, error } = await client().rpc('list_arena_room_presence', {
    p_room_id: roomId,
    p_limit: limit,
  });
  if (error) throw requestError(error);
  if (!Array.isArray(data)) return [];
  const out: ArenaRoomPresence[] = [];
  for (const item of data) {
    const author = toAuthor(item);
    if (!author) continue;
    const row = asRecord(item);
    out.push({ ...author, isViewer: bool(row?.isViewer) });
  }
  return out;
}

export async function watchRoom(roomId: string): Promise<ArenaJoinResult> {
  const { data, error } = await client().rpc('watch_arena_room', { p_room_id: roomId });
  if (error) throw requestError(error);
  const record = asRecord(data);
  const nextRoomId = record ? str(record.roomId) : null;
  const joinRole = record ? (oneOf(record.role, ROLES) ?? 'spectator') : null;
  if (!record || !nextRoomId || !joinRole) bad('watch_arena_room');
  return {
    joined: bool(record.joined),
    roomId: nextRoomId,
    topicId: str(record.topicId) ?? '',
    stance: oneOf(record.stance, STANCES),
    role: joinRole,
    status: oneOf(record.status, ROOM_STATUSES) ?? 'OPEN',
    capacity: num(record.capacity) ?? 0,
    participantCount: num(record.participantCount) ?? 0,
    joinedAt: millis(record.joinedAt) ?? Date.now(),
  };
}

/**
 * Join today's topic and get auto-placed into a room.
 *
 * Debaters must pass a stance. Spectators pass `null` stance + role `spectator`
 * and never record a private position.
 *
 * Idempotent: a second call returns the existing membership and the stance
 * recorded the first time. A stance is immutable, so re-joining with a different
 * one is quietly ignored by the server rather than rejected.
 */
export async function joinTopic(
  topicId: string,
  stance: Stance | null,
  role: ArenaParticipantRole = 'debater',
): Promise<ArenaJoinResult> {
  const { data, error } = await client().rpc('join_arena_topic', {
    p_topic_id: topicId,
    p_stance: stance ?? undefined,
    p_role: role,
  });
  if (error) throw requestError(error);
  const record = asRecord(data);
  const roomId = record ? str(record.roomId) : null;
  const joinRole = record ? (oneOf(record.role, ROLES) ?? 'debater') : null;
  const joinStance = record ? oneOf(record.stance, STANCES) : null;
  if (!record || !roomId || !joinRole) bad('join_arena_topic');
  if (joinRole === 'debater' && !joinStance) bad('join_arena_topic');
  return {
    joined: bool(record.joined),
    roomId,
    topicId: str(record.topicId) ?? topicId,
    stance: joinStance,
    role: joinRole,
    status: oneOf(record.status, ROOM_STATUSES) ?? 'OPEN',
    capacity: num(record.capacity) ?? 0,
    participantCount: num(record.participantCount) ?? 0,
    joinedAt: millis(record.joinedAt) ?? Date.now(),
  };
}

export interface ArenaUpgradeResult {
  upgraded: boolean;
  roomId: string;
  topicId: string;
  stance: Stance;
  role: ArenaParticipantRole;
  status: ArenaRoomStatus;
  capacity: number;
  participantCount: number;
  joinedAt: number;
}

/**
 * Spectator → debater in the same room. Records the private initial stance and
 * consumes one capacity slot. Never creates a second membership row.
 */
export async function upgradeSpectator(
  roomId: string,
  stance: Stance,
): Promise<ArenaUpgradeResult> {
  const { data, error } = await client().rpc('upgrade_arena_spectator', {
    p_room_id: roomId,
    p_stance: stance,
  });
  if (error) throw requestError(error);
  const record = asRecord(data);
  const nextRoomId = record ? str(record.roomId) : null;
  const nextStance = record ? oneOf(record.stance, STANCES) : null;
  if (!record || !nextRoomId || !nextStance) bad('upgrade_arena_spectator');
  return {
    upgraded: bool(record.upgraded),
    roomId: nextRoomId,
    topicId: str(record.topicId) ?? '',
    stance: nextStance,
    role: oneOf(record.role, ROLES) ?? 'debater',
    status: oneOf(record.status, ROOM_STATUSES) ?? 'OPEN',
    capacity: num(record.capacity) ?? 0,
    participantCount: num(record.participantCount) ?? 0,
    joinedAt: millis(record.joinedAt) ?? Date.now(),
  };
}

// ── Room + thread ───────────────────────────────────────────────────────────

export async function fetchRoom(roomId: string): Promise<ArenaRoom> {
  const { data, error } = await client().rpc('get_arena_room', { p_room_id: roomId });
  if (error) throw requestError(error);
  return toRoom(data);
}

/**
 * A page of the thread, newest first.
 *
 * Ordering: server `created_at` desc, then `id` desc (stable). Never client clocks.
 *
 * `before` pages older (pass oldest createdAt held).
 * `after` gap-fetches newer after reconnect (pass newest createdAt held).
 *
 * Members only — hidden messages and blocked/muted authors are filtered server-side.
 */
export async function fetchMessages(
  roomId: string,
  before?: number,
  limit = 50,
  after?: number,
): Promise<ArenaMessage[]> {
  const { data, error } = await client().rpc('list_arena_room_messages', {
    p_room_id: roomId,
    p_limit: limit,
    ...(before !== undefined ? { p_before: new Date(before).toISOString() } : {}),
    ...(after !== undefined ? { p_after: new Date(after).toISOString() } : {}),
  });
  if (error) throw requestError(error);
  return (data ?? []).map(toMessage);
}

/** Messages strictly newer than `after` — reconnect gap recovery. */
export async function fetchMessagesSince(
  roomId: string,
  after: number,
  limit = 50,
): Promise<ArenaMessage[]> {
  return fetchMessages(roomId, undefined, limit, after);
}

const PULSE_CATEGORIES = [
  'TOP_ARGUMENT',
  'BEST_EVIDENCE',
  'BEST_REBUTTAL',
  'FAST_RISING',
  'CROWD_FAVORITE',
] as const;

function toPulseLeader(value: Json | undefined): ArenaPulseLeader | null {
  const record = asRecord(value ?? null);
  if (!record) return null;
  const category = oneOf(record.category, PULSE_CATEGORIES);
  if (!category) return null;
  return {
    category,
    label: str(record.label) ?? category,
    messageId: str(record.messageId),
    evidenceId: str(record.evidenceId),
    author: toAuthor(record.author),
    score: num(record.score) ?? 0,
    preview: str(record.preview) ?? '',
  };
}

/** Deterministic Room Pulse leaders for the current room. Categories may be empty. */
export async function fetchRoomPulse(roomId: string): Promise<ArenaRoomPulse> {
  const { data, error } = await client().rpc('get_arena_room_pulse', {
    p_room_id: roomId,
  });
  if (error) throw requestError(error);
  const record = asRecord(data);
  if (!record) bad('get_arena_room_pulse');
  const leadersRaw = record.leaders;
  const leaders: ArenaPulseLeader[] = [];
  if (Array.isArray(leadersRaw)) {
    for (const item of leadersRaw) {
      const leader = toPulseLeader(item as Json);
      if (leader) leaders.push(leader);
    }
  }
  return {
    roomId: str(record.roomId) ?? roomId,
    status: oneOf(record.status, ROOM_STATUSES) ?? 'OPEN',
    leaders,
    generatedAt: millis(record.generatedAt) ?? Date.now(),
  };
}

export interface PostArenaMessageInput {
  roomId: string;
  body: string;
  parentMessageId?: string | null;
  media?: ArenaMediaAttachment;
  gif?: ArenaGifAttachment;
}

/**
 * Post into the thread.
 *
 * `post_arena_room_message` returns the raw inserted row rather than the render
 * payload, so the author card has to be supplied by the caller (it is always the
 * viewer). Reactions start empty and vote counts stay withheld until settlement.
 */
export async function postMessage(
  input: PostArenaMessageInput,
  author: ArenaAuthor | null = null,
): Promise<ArenaMessage> {
  const { roomId, body, parentMessageId, media, gif } = input;
  if (media && gif) {
    throw new SupabaseError('Choose either an upload or a GIF, not both', 'bad_payload');
  }
  const { data, error } = await client().rpc('post_arena_room_message', {
    p_room_id: roomId,
    p_body: body.slice(0, ARENA_MESSAGE_MAX),
    ...(parentMessageId ? { p_parent_message_id: parentMessageId } : {}),
    ...(media ? { p_media_object_id: media.mediaObjectId, p_media_url: media.url } : {}),
    ...(gif
      ? {
          p_media_url: gif.url,
          p_gif_provider: gif.provider,
          p_gif_external_id: gif.externalId,
        }
      : {}),
  });
  if (error) throw requestError(error);
  const row = data?.[0];
  if (!row) bad('post_arena_room_message');
  return {
    id: row.id,
    roomId: row.room_id,
    kind: row.kind,
    body: row.body,
    parentMessageId: row.parent_message_id,
    createdAt: Date.parse(row.created_at),
    mediaUrl: row.media_url,
    mediaKind: row.media_kind,
    gifProvider: row.gif_provider,
    gifExternalId: row.gif_external_id,
    isOwn: true,
    author,
    reactions: [],
    replyCount: 0,
    argumentVotes: null,
  };
}

/** Toggle one emoji reaction. The server recomputes the count; never the client. */
export async function reactMessage(messageId: string, emoji = '🔥'): Promise<ArenaReactionResult> {
  const { data, error } = await client().rpc('react_arena_room_message', {
    p_message_id: messageId,
    p_emoji: emoji,
  });
  if (error) throw requestError(error);
  const record = asRecord(data);
  if (!record) bad('react_arena_room_message');
  return {
    messageId: str(record.messageId) ?? messageId,
    emoji: str(record.emoji) ?? emoji,
    reacted: bool(record.reacted),
    count: num(record.count) ?? 0,
  };
}

// ── Evidence ────────────────────────────────────────────────────────────────

/** The evidence rail: most useful first, then newest. Members only. */
export async function fetchEvidence(roomId: string, limit = 50): Promise<ArenaEvidence[]> {
  const { data, error } = await client().rpc('list_arena_room_evidence', {
    p_room_id: roomId,
    p_limit: limit,
  });
  if (error) throw requestError(error);
  return (data ?? []).map(toEvidence);
}

export interface SubmitArenaEvidenceInput {
  roomId: string;
  kind: ArenaEvidenceKind;
  title: string;
  /** Required for `link`; refused for an upload. Must pass `isAllowedHttpUrl`. */
  sourceUrl?: string;
  /** Required for `image` / `video`; refused for a link. */
  media?: ArenaMediaAttachment;
}

export async function submitEvidence(input: SubmitArenaEvidenceInput): Promise<ArenaEvidence> {
  const { roomId, kind, title, sourceUrl, media } = input;
  const { data, error } = await client().rpc('submit_arena_evidence', {
    p_room_id: roomId,
    p_kind: kind,
    p_title: title.slice(0, ARENA_EVIDENCE_TITLE_MAX),
    ...(kind === 'link' ? { p_source_url: sourceUrl } : {}),
    ...(kind !== 'link' && media
      ? { p_media_object_id: media.mediaObjectId, p_media_url: media.url }
      : {}),
  });
  if (error) throw requestError(error);
  return toEvidence(data);
}

/** Toggle a "useful" mark. Self-marking is refused server-side. */
export async function markEvidenceUseful(evidenceId: string): Promise<ArenaEvidenceMarkResult> {
  const { data, error } = await client().rpc('mark_arena_evidence_useful', {
    p_evidence_id: evidenceId,
  });
  if (error) throw requestError(error);
  const record = asRecord(data);
  if (!record) bad('mark_arena_evidence_useful');
  return {
    evidenceId: str(record.evidenceId) ?? evidenceId,
    marked: bool(record.marked),
    usefulCount: num(record.usefulCount) ?? 0,
  };
}

// ── Ballots ─────────────────────────────────────────────────────────────────

/** One side vote per debater, JUDGING only, AGREE or DISAGREE (never DRAW). */
export async function submitSideVote(
  roomId: string,
  side: 'AGREE' | 'DISAGREE',
): Promise<ArenaSideVoteResult> {
  const { data, error } = await client().rpc('submit_arena_side_vote', {
    p_room_id: roomId,
    p_side: side,
  });
  if (error) throw requestError(error);
  const record = asRecord(data);
  if (!record) bad('submit_arena_side_vote');
  return {
    roomId: str(record.roomId) ?? roomId,
    side: oneOf(record.side, SIDES) ?? side,
    recorded: bool(record.recorded),
  };
}

/** One best-argument vote per debater. You cannot vote for your own argument. */
export async function submitArgumentVote(
  roomId: string,
  messageId: string,
): Promise<ArenaArgumentVoteResult> {
  const { data, error } = await client().rpc('submit_arena_argument_vote', {
    p_room_id: roomId,
    p_message_id: messageId,
  });
  if (error) throw requestError(error);
  const record = asRecord(data);
  if (!record) bad('submit_arena_argument_vote');
  return {
    roomId: str(record.roomId) ?? roomId,
    messageId: str(record.messageId) ?? messageId,
    recorded: bool(record.recorded),
  };
}

// ── Mindshift ───────────────────────────────────────────────────────────────

/** The Mindshift half: after the verdict, did the room move you? Write-once. */
export async function recordFinalStance(
  roomId: string,
  stance: Stance,
): Promise<ArenaFinalStanceResult> {
  const { data, error } = await client().rpc('record_arena_final_stance', {
    p_room_id: roomId,
    p_stance: stance,
  });
  if (error) throw requestError(error);
  const record = asRecord(data);
  const initial = record ? oneOf(record.initialStance, STANCES) : null;
  const final = record ? oneOf(record.finalStance, STANCES) : null;
  if (!record || !initial || !final) bad('record_arena_final_stance');
  return {
    roomId: str(record.roomId) ?? roomId,
    initialStance: initial,
    finalStance: final,
    finalRecordedAt: millis(record.finalRecordedAt),
    changed: bool(record.changed),
  };
}

/** Room-level aggregate only. Individual stances are never exposed. */
export async function fetchMindshiftStats(roomId: string): Promise<ArenaMindshiftStats> {
  const { data, error } = await client().rpc('arena_room_mindshift_stats', { p_room_id: roomId });
  if (error) throw requestError(error);
  const record = asRecord(data);
  if (!record) bad('arena_room_mindshift_stats');
  return {
    roomId: str(record.roomId) ?? roomId,
    totalInitialParticipants: num(record.totalInitialParticipants) ?? 0,
    completedParticipants: num(record.completedParticipants) ?? 0,
    changedCount: num(record.changedCount) ?? 0,
    changedPercent: num(record.changedPercent),
  };
}

// ── Media ───────────────────────────────────────────────────────────────────

/** What `useMediaPicker` hands back; re-declared so services never import a hook. */
export interface ArenaPickedMedia {
  uri: string;
  kind: MediaKind;
  mimeType: string | null;
  width: number;
  height: number;
  durationMs: number | null;
}

function mimeFor(media: ArenaPickedMedia): string {
  if (media.mimeType) return media.mimeType;
  const ext = media.uri.split('.').pop()?.toLowerCase();
  const known: { [key: string]: string } = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
  };
  if (ext && known[ext]) return known[ext];
  return media.kind === 'video' ? 'video/mp4' : 'image/jpeg';
}

/**
 * Upload a picked asset as public Arena media and return the attachment the
 * message / evidence RPCs expect. A failed upload is tombstoned so a half-written
 * object can never later read as `ready`.
 */
export async function uploadArenaMedia(picked: ArenaPickedMedia): Promise<ArenaMediaAttachment> {
  if (picked.kind !== 'image' && picked.kind !== 'video') {
    throw new SupabaseError('Only photos and videos can be uploaded here.', 'bad_payload');
  }
  const mime = mimeFor(picked);
  const plan = await createUpload(picked.kind, mime, 'public');
  try {
    const bytes = await readPickedBytes(picked.uri);
    await uploadFile(plan, bytes, mime);
    await completeUpload(plan.id, bytes.byteLength, {
      width: picked.width,
      height: picked.height,
      ...(picked.durationMs ? { durationMs: picked.durationMs } : {}),
    });
    return {
      mediaObjectId: plan.id,
      url: getPublicMediaUrl(plan.bucket, plan.path),
      kind: picked.kind,
    };
  } catch (error) {
    void failUpload(plan.id).catch(() => undefined);
    throw error;
  }
}

// ── Realtime ────────────────────────────────────────────────────────────────

/** The slice of a realtime INSERT the app can trust without a second read. */
export interface ArenaMessageEvent {
  id: string;
  roomId: string;
  authorId: string;
  createdAt: number;
}

/**
 * Subscribe to new arguments in one room.
 *
 * The channel listens to `postgres_changes` INSERTs on `arena_room_messages`
 * filtered to this room, and **RLS decides what actually arrives**: a non-member
 * receives nothing, and a message from someone the viewer blocks or mutes is
 * never delivered. The filter is a bandwidth optimisation, not the security
 * boundary.
 *
 * Only the raw row crosses the wire — no author card, no reaction rollup — so
 * the callback deliberately reports an event rather than a renderable message.
 * Callers refresh the recent page to pick up the full payload.
 *
 * Realtime authorises with the session JWT, so the token is pushed to the socket
 * before subscribing; without a session the server sends nothing at all.
 *
 * @returns an unsubscribe function. Always call it on unmount.
 */
export function subscribeRoomMessages(
  roomId: string,
  onInsert: (event: ArenaMessageEvent) => void,
): () => void {
  const supabase = client();
  const channel = supabase.channel(`arena-room:${roomId}`);

  let disposed = false;

  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'arena_room_messages',
      filter: `room_id=eq.${roomId}`,
    },
    (payload) => {
      const row = payload.new as {
        id?: unknown;
        room_id?: unknown;
        author_id?: unknown;
        created_at?: unknown;
      } | null;
      if (!row || typeof row.id !== 'string' || typeof row.room_id !== 'string') return;
      onInsert({
        id: row.id,
        roomId: row.room_id,
        authorId: typeof row.author_id === 'string' ? row.author_id : '',
        createdAt:
          typeof row.created_at === 'string' ? (Date.parse(row.created_at) || Date.now()) : Date.now(),
      });
    },
  );

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
    } catch {
      // No session (or a transient auth read failure): subscribe anyway and let
      // RLS stay silent rather than crashing the room screen.
    }
    if (disposed) return;
    channel.subscribe();
  })();

  return () => {
    disposed = true;
    void supabase.removeChannel(channel);
  };
}

/**
 * Ephemeral room typing via Realtime Presence.
 * Channel is room-scoped — Room 1 never sees Room 2 typers.
 * Payload never includes draft text or stance.
 *
 * @returns controllers to set/clear typing + unsubscribe
 */
export function subscribeRoomTyping(
  roomId: string,
  viewer: { userId: string; handle: string; name: string; avatarTint: string },
  onPeers: (peers: ArenaTypingState[]) => void,
): {
  setTyping: (replyingToMessageId: string | null) => void;
  clearTyping: () => void;
  unsubscribe: () => void;
} {
  const supabase = client();
  const channel = supabase.channel(`arena-typing:${roomId}`, {
    config: { presence: { key: viewer.userId } },
  });

  let disposed = false;

  const publishPeers = (): void => {
    if (disposed) return;
    const state = channel.presenceState();
    const peers: ArenaTypingState[] = [];
    for (const metas of Object.values(state)) {
      const meta = (metas?.[0] ?? null) as Partial<ArenaTypingState> | null;
      if (!meta || typeof meta.userId !== 'string') continue;
      if (meta.typing !== true) continue;
      peers.push({
        userId: meta.userId,
        handle: typeof meta.handle === 'string' ? meta.handle : '',
        name: typeof meta.name === 'string' ? meta.name : '',
        avatarTint: typeof meta.avatarTint === 'string' ? meta.avatarTint : '#A1A1AA',
        replyingToMessageId:
          typeof meta.replyingToMessageId === 'string' ? meta.replyingToMessageId : null,
        typing: true,
      });
    }
    onPeers(peers);
  };

  channel.on('presence', { event: 'sync' }, publishPeers);
  channel.on('presence', { event: 'join' }, publishPeers);
  channel.on('presence', { event: 'leave' }, publishPeers);

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
    } catch {
      /* allow subscribe; presence stays empty without auth */
    }
    if (disposed) return;
    channel.subscribe();
  })();

  const setTyping = (replyingToMessageId: string | null): void => {
    if (disposed) return;
    void channel.track({
      userId: viewer.userId,
      handle: viewer.handle,
      name: viewer.name,
      avatarTint: viewer.avatarTint,
      replyingToMessageId,
      typing: true,
    });
  };

  const clearTyping = (): void => {
    void channel.untrack();
  };

  const unsubscribe = (): void => {
    disposed = true;
    void channel.untrack();
    void supabase.removeChannel(channel);
  };

  return { setTyping, clearTyping, unsubscribe };
}
