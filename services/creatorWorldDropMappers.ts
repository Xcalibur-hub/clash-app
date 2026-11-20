/**
 * Domain types + parsers for Creator World Drops (Phase 15.3).
 * Server payloads never leak past this file; reward *payloads* only ever arrive
 * through the claim response, never through a public list.
 */

export type CreatorDropType = 'SECRET_DROP' | 'CHALLENGE' | 'COLLECTIBLE' | 'CREATOR_UNLOCK';
export type CreatorDropReward =
  | 'BADGE'
  | 'COLLECTIBLE'
  | 'CONTENT_UNLOCK'
  | 'WORLD_ACCESS'
  | 'CHALLENGE_STATUS';
export type CreatorDropStatus = 'DRAFT' | 'PUBLISHED' | 'EXPIRED' | 'REMOVED';

export interface CreatorDropMedia {
  bucket: string;
  path: string;
  kind: string;
}

export interface CreatorDropAuthor {
  id: string;
  handle: string;
  name: string;
  avatarTint: string;
}

export interface CreatorDropMission {
  id: string;
  title: string;
  prompt: string;
}

export interface CreatorWorldDrop {
  id: string;
  caption: string;
  status: CreatorDropStatus;
  dropType: CreatorDropType;
  clue: string | null;
  rewardType: CreatorDropReward;
  rewardRef: string | null;
  creatorId: string | null;
  creatorName: string | null;
  creatorHandle: string | null;
  creatorTint: string | null;
  approxLat: number;
  approxLng: number;
  locationLabel: string | null;
  distanceBand: string | null;
  publishedAt: number | null;
  expiresAt: number | null;
  claimed: boolean;
  claimable: boolean;
  media: CreatorDropMedia | null;
  /** Mission-style drops (legacy World) keep their author + mission context. */
  author: CreatorDropAuthor | null;
  mission: CreatorDropMission | null;
}

export interface CreatorDropClaim {
  claimed: boolean;
  alreadyClaimed: boolean;
  dropId: string;
  rewardType: CreatorDropReward;
  rewardRef: string | null;
  claimedAt: number | null;
}

export interface WorldArtifact {
  dropId: string;
  rewardType: CreatorDropReward;
  rewardRef: string | null;
  claimedAt: number | null;
  caption: string;
  dropType: CreatorDropType;
  creatorId: string | null;
  creatorName: string | null;
  creatorHandle: string | null;
  creatorTint: string | null;
  media: CreatorDropMedia | null;
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

const DROP_TYPES: readonly CreatorDropType[] = ['SECRET_DROP', 'CHALLENGE', 'COLLECTIBLE', 'CREATOR_UNLOCK'];
const REWARDS: readonly CreatorDropReward[] = ['BADGE', 'COLLECTIBLE', 'CONTENT_UNLOCK', 'WORLD_ACCESS', 'CHALLENGE_STATUS'];
const STATUSES: readonly CreatorDropStatus[] = ['DRAFT', 'PUBLISHED', 'EXPIRED', 'REMOVED'];

export function parseCreatorDropMedia(value: unknown): CreatorDropMedia | null {
  const record = asRecord(value);
  if (!record) return null;
  const bucket = str(record.bucket);
  const path = str(record.path);
  if (!bucket || !path) return null;
  return { bucket, path, kind: str(record.kind) ?? 'image' };
}

export function parseCreatorDropAuthor(value: unknown): CreatorDropAuthor | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = str(record.id);
  if (!id) return null;
  return {
    id,
    handle: str(record.handle) ?? '',
    name: str(record.name) ?? 'Someone',
    avatarTint: str(record.avatarTint) ?? '#A1A1AA',
  };
}

export function parseCreatorDropMission(value: unknown): CreatorDropMission | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = str(record.id);
  if (!id) return null;
  return { id, title: str(record.title) ?? '', prompt: str(record.prompt) ?? '' };
}

export function toCreatorWorldDrop(value: unknown): CreatorWorldDrop | null {
  const r = asRecord(value);
  if (!r) return null;
  const id = str(r.id);
  const caption = str(r.caption);
  const approxLat = num(r.approxLat);
  const approxLng = num(r.approxLng);
  if (!id || caption === null || approxLat === null || approxLng === null) return null;
  return {
    id,
    caption,
    status: oneOf(r.status, STATUSES, 'PUBLISHED'),
    dropType: oneOf(r.dropType, DROP_TYPES, 'SECRET_DROP'),
    clue: str(r.clue),
    rewardType: oneOf(r.rewardType, REWARDS, 'COLLECTIBLE'),
    rewardRef: str(r.rewardRef),
    creatorId: str(r.creatorId),
    creatorName: str(r.creatorName),
    creatorHandle: str(r.creatorHandle),
    creatorTint: str(r.creatorTint),
    approxLat,
    approxLng,
    locationLabel: str(r.locationLabel),
    distanceBand: str(r.distanceBand),
    publishedAt: epoch(r.publishedAt),
    expiresAt: epoch(r.expiresAt),
    claimed: r.claimed === true,
    claimable: r.claimable === true,
    media: parseCreatorDropMedia(r.media),
    author: parseCreatorDropAuthor(r.author),
    mission: parseCreatorDropMission(r.mission),
  };
}

export function toCreatorWorldDropList(value: unknown): CreatorWorldDrop[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toCreatorWorldDrop(entry))
    .filter((entry): entry is CreatorWorldDrop => entry !== null);
}

export function toCreatorDropClaim(value: unknown): CreatorDropClaim | null {
  const r = asRecord(value);
  if (!r) return null;
  const dropId = str(r.dropId);
  if (!dropId) return null;
  return {
    claimed: r.claimed === true,
    alreadyClaimed: r.alreadyClaimed === true,
    dropId,
    rewardType: oneOf(r.rewardType, REWARDS, 'COLLECTIBLE'),
    rewardRef: str(r.rewardRef),
    claimedAt: epoch(r.claimedAt),
  };
}

export function toWorldArtifactList(value: unknown): WorldArtifact[] {
  if (!Array.isArray(value)) return [];
  const out: WorldArtifact[] = [];
  for (const entry of value) {
    const r = asRecord(entry);
    if (!r) continue;
    const dropId = str(r.dropId);
    const caption = str(r.caption);
    if (!dropId || caption === null) continue;
    out.push({
      dropId,
      rewardType: oneOf(r.rewardType, REWARDS, 'COLLECTIBLE'),
      rewardRef: str(r.rewardRef),
      claimedAt: epoch(r.claimedAt),
      caption,
      dropType: oneOf(r.dropType, DROP_TYPES, 'SECRET_DROP'),
      creatorId: str(r.creatorId),
      creatorName: str(r.creatorName),
      creatorHandle: str(r.creatorHandle),
      creatorTint: str(r.creatorTint),
      media: parseCreatorDropMedia(r.media),
    });
  }
  return out;
}