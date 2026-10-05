/**
 * Domain types + parsers for Interactive Creator Live (Phase 15.4).
 * Server payloads never leak past this file.
 */

import type {
  LiveActionKind,
  LiveInteractionStatus,
  LiveInteractionType,
  LiveOption,
  LiveStatus,
  LiveTallies,
} from '../utils/creatorLiveState';

export type LiveAccess = 'FREE' | 'SUBSCRIBER';
export type LiveProviderName = 'standby' | 'hls' | 'file' | 'embed';

export interface LiveMedia {
  bucket: string;
  path: string;
  kind: string;
}

export interface LivePermissions {
  polls: boolean;
  choices: boolean;
  crowdActions: boolean;
  gameActions: boolean;
}

export interface CreatorLiveSession {
  id: string;
  title: string;
  description: string;
  access: LiveAccess;
  status: LiveStatus;
  provider: LiveProviderName;
  /** Present only when the viewer is allowed to watch a live session. */
  streamUrl: string | null;
  creatorId: string;
  creatorName: string | null;
  creatorHandle: string | null;
  creatorTint: string | null;
  permissions: LivePermissions;
  coverMedia: LiveMedia | null;
  scheduledAt: number | null;
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number | null;
  viewerAccess: boolean;
  isOwner: boolean;
  canParticipate: boolean;
  watching: number;
}

export interface CreatorLiveInteraction {
  id: string;
  sessionId: string;
  type: LiveInteractionType;
  prompt: string;
  options: LiveOption[] | null;
  actionKind: LiveActionKind | null;
  threshold: number | null;
  status: LiveInteractionStatus;
  openedAt: number;
  closesAt: number | null;
  closedAt: number | null;
  triggeredAt: number | null;
  tallies: LiveTallies;
  totalVotes: number;
  triggered: boolean;
  result: Record<string, unknown> | null;
  voted: boolean;
  myVote: string | null;
  canParticipate: boolean;
}

export interface CreatorLiveVoteResult {
  accepted: boolean;
  alreadyVoted: boolean;
  total: number;
  tallies: LiveTallies;
  triggered: boolean;
  actionKind: LiveActionKind | null;
  status: LiveInteractionStatus;
}

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
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function epoch(value: unknown): number | null {
  const text = str(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const STATUSES: readonly LiveStatus[] = ['SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED'];
const INTERACTION_STATUSES: readonly LiveInteractionStatus[] = ['OPEN', 'CLOSED', 'TRIGGERED', 'CANCELLED'];
const TYPES: readonly LiveInteractionType[] = ['POLL', 'CHOICE', 'CROWD_ACTION', 'GAME_ACTION'];
const ACTIONS: readonly LiveActionKind[] = [
  'LIGHTS_OFF',
  'LIGHTS_ON',
  'OPEN_LEFT_DOOR',
  'OPEN_RIGHT_DOOR',
  'FOG_BURST',
  'MUSIC_STING',
  'CAMERA_CUT',
  'HOLD_FRAME',
];
const PROVIDERS: readonly LiveProviderName[] = ['standby', 'hls', 'file', 'embed'];

export function parseLiveMedia(value: unknown): LiveMedia | null {
  const record = asRecord(value);
  if (!record) return null;
  const bucket = str(record.bucket);
  const path = str(record.path);
  if (!bucket || !path) return null;
  return { bucket, path, kind: str(record.kind) ?? 'image' };
}

function parseOptions(value: unknown): LiveOption[] | null {
  if (!Array.isArray(value)) return null;
  const out: LiveOption[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const id = record ? str(record.id) : null;
    const label = record ? str(record.label) : null;
    if (!id || !label) continue;
    out.push({ id, label });
  }
  return out.length > 0 ? out : null;
}

export function parseTallies(value: unknown): LiveTallies {
  const record = asRecord(value);
  if (!record) return {};
  const out: LiveTallies = {};
  for (const [key, raw] of Object.entries(record)) {
    const n = num(raw);
    if (n !== null) out[key] = n;
  }
  return out;
}


export function parseCreatorLiveSession(value: unknown): CreatorLiveSession | null {
  const r = asRecord(value);
  if (!r) return null;
  const id = str(r.id);
  const creatorId = str(r.creatorId);
  const title = str(r.title);
  if (!id || !creatorId || title === null) return null;
  const permissions = asRecord(r.permissions);
  return {
    id,
    title,
    description: str(r.description) ?? '',
    access: oneOf(r.access, ['FREE', 'SUBSCRIBER'] as const, 'FREE'),
    status: oneOf(r.status, STATUSES, 'SCHEDULED'),
    provider: oneOf(r.provider, PROVIDERS, 'standby'),
    streamUrl: str(r.streamUrl),
    creatorId,
    creatorName: str(r.creatorName),
    creatorHandle: str(r.creatorHandle),
    creatorTint: str(r.creatorTint),
    permissions: {
      polls: permissions?.polls === true,
      choices: permissions?.choices === true,
      crowdActions: permissions?.crowdActions === true,
      gameActions: permissions?.gameActions === true,
    },
    coverMedia: parseLiveMedia(r.coverMedia),
    scheduledAt: epoch(r.scheduledAt),
    startedAt: epoch(r.startedAt),
    endedAt: epoch(r.endedAt),
    createdAt: epoch(r.createdAt),
    viewerAccess: r.viewerAccess === true,
    isOwner: r.isOwner === true,
    canParticipate: r.canParticipate === true,
    watching: num(r.watching) ?? 0,
  };
}

export function parseCreatorLiveSessionList(value: unknown): CreatorLiveSession[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => parseCreatorLiveSession(entry))
    .filter((entry): entry is CreatorLiveSession => entry !== null);
}

export function parseCreatorLiveInteraction(value: unknown): CreatorLiveInteraction | null {
  const r = asRecord(value);
  if (!r) return null;
  const id = str(r.id);
  const sessionId = str(r.sessionId);
  const openedAt = epoch(r.openedAt);
  if (!id || !sessionId || openedAt === null) return null;
  return {
    id,
    sessionId,
    type: oneOf(r.type, TYPES, 'POLL'),
    prompt: str(r.prompt) ?? '',
    options: parseOptions(r.options),
    actionKind: typeof r.actionKind === 'string' ? oneOf(r.actionKind, ACTIONS, 'LIGHTS_OFF') : null,
    threshold: num(r.threshold),
    status: oneOf(r.status, INTERACTION_STATUSES, 'OPEN'),
    openedAt,
    closesAt: epoch(r.closesAt),
    closedAt: epoch(r.closedAt),
    triggeredAt: epoch(r.triggeredAt),
    tallies: parseTallies(r.tallies),
    totalVotes: num(r.totalVotes) ?? 0,
    triggered: r.triggered === true,
    result: asRecord(r.result),
    voted: r.voted === true,
    myVote: str(r.myVote),
    canParticipate: r.canParticipate === true,
  };
}

export function parseCreatorLiveInteractionList(value: unknown): CreatorLiveInteraction[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => parseCreatorLiveInteraction(entry))
    .filter((entry): entry is CreatorLiveInteraction => entry !== null);
}

export function parseCreatorLiveVoteResult(value: unknown): CreatorLiveVoteResult | null {
  const r = asRecord(value);
  if (!r) return null;
  if (r.accepted === undefined && r.alreadyVoted === undefined) return null;
  return {
    accepted: r.accepted === true,
    alreadyVoted: r.alreadyVoted === true,
    total: num(r.total) ?? 0,
    tallies: parseTallies(r.tallies),
    triggered: r.triggered === true,
    actionKind: typeof r.actionKind === 'string' ? oneOf(r.actionKind, ACTIONS, 'LIGHTS_OFF') : null,
    status: oneOf(r.status, INTERACTION_STATUSES, 'OPEN'),
  };
}

