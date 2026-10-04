/**
 * Domain types + defensive parsers for Creator Communities (Phase 15.2).
 *
 * Server payloads never leak past this file: JSON from the `vault_community_*`
 * RPCs (and rows for the Studio) become the camelCase shapes the screens use.
 * A pseudonymous author is projected with `profileId: null` / `handle: null`.
 */

import type { CommunityIdentity } from '../utils/vaultCommunityPseudonym';

export type CommunityAccessType = 'public' | 'followers' | 'subscribers';
export type CommunityStatus = 'active' | 'disabled';
export type CommunityPostType = 'discussion' | 'announcement';
export type CommunityContentStatus = 'visible' | 'hidden' | 'deleted';

export interface CommunityMedia {
  bucket: string;
  path: string;
  kind: string;
}

export interface CommunityPostCard {
  id: string;
  communityId: string;
  type: CommunityPostType;
  body: string;
  createdAt: number;
  updatedAt: number;
  replyCount: number;
  identity: CommunityIdentity;
  media: CommunityMedia | null;
  status: CommunityContentStatus;
  isMine: boolean;
  canDelete: boolean;
  canModerate: boolean;
}

export interface CommunityReplyCard {
  id: string;
  postId: string;
  communityId: string;
  parentReplyId: string | null;
  body: string;
  createdAt: number;
  identity: CommunityIdentity;
  status: CommunityContentStatus;
  isMine: boolean;
  canDelete: boolean;
  canModerate: boolean;
}

export interface CommunitySummary {
  id: string;
  creatorId: string;
  name: string;
  description: string;
  accessType: CommunityAccessType;
  status: CommunityStatus;
  pseudonymousEnabled: boolean;
  rules: string;
  iconMedia: CommunityMedia | null;
  memberCount: number;
  activeToday: number;
  viewerAccess: boolean;
  viewerIsCreator: boolean;
  viewerIsMember: boolean;
  viewerCanPost: boolean;
  viewerCanAnnounce: boolean;
  viewerCanModerate: boolean;
  viewerPseudonym: string | null;
  latestAnnouncement: CommunityPostCard | null;
}

/** The Studio's editable view of the creator's own community row. */
export interface CommunitySettings {
  id: string;
  creatorId: string;
  vaultId: string;
  name: string;
  description: string;
  accessType: CommunityAccessType;
  status: CommunityStatus;
  pseudonymousEnabled: boolean;
  rules: string;
  iconMediaObjectId: string | null;
  createdAt: number;
  updatedAt: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function epoch(value: unknown): number {
  const text = str(value);
  return text ? Date.parse(text) : 0;
}

function access(value: unknown): CommunityAccessType {
  return value === 'followers' || value === 'subscribers' ? value : 'public';
}

function status(value: unknown): CommunityStatus {
  return value === 'disabled' ? 'disabled' : 'active';
}

function contentStatus(value: unknown): CommunityContentStatus {
  return value === 'hidden' || value === 'deleted' ? value : 'visible';
}

export function parseCommunityMedia(value: unknown): CommunityMedia | null {
  const record = asRecord(value);
  if (!record) return null;
  const bucket = str(record.bucket);
  const path = str(record.path);
  if (!bucket || !path) return null;
  return { bucket, path, kind: str(record.kind) ?? 'image' };
}

/** Reads the identity projection the RPCs emit — never invents a real id. */
export function parseCommunityIdentity(record: Record<string, unknown>): CommunityIdentity {
  const pseudonymous = bool(record.pseudonymous);
  return {
    name: str(record.authorName) ?? 'Member',
    handle: pseudonymous ? null : str(record.authorHandle),
    profileId: pseudonymous ? null : str(record.authorId),
    tint: str(record.authorTint) ?? '#A1A1AA',
    pseudonymous,
  };
}

export function toCommunityPostCard(value: unknown): CommunityPostCard | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = str(record.id);
  const communityId = str(record.communityId);
  if (!id || !communityId) return null;
  return {
    id,
    communityId,
    type: record.type === 'announcement' ? 'announcement' : 'discussion',
    body: str(record.body) ?? '',
    createdAt: epoch(record.createdAt),
    updatedAt: epoch(record.updatedAt),
    replyCount: num(record.replyCount) ?? 0,
    identity: parseCommunityIdentity(record),
    media: parseCommunityMedia(record.media),
    status: contentStatus(record.status),
    isMine: bool(record.isMine),
    canDelete: bool(record.canDelete),
    canModerate: bool(record.canModerate),
  };
}

export function toCommunityPostList(value: unknown): CommunityPostCard[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toCommunityPostCard(entry))
    .filter((entry): entry is CommunityPostCard => entry !== null);
}

export function toCommunityReplyCard(value: unknown): CommunityReplyCard | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = str(record.id);
  const postId = str(record.postId);
  const communityId = str(record.communityId);
  if (!id || !postId || !communityId) return null;
  return {
    id,
    postId,
    communityId,
    parentReplyId: str(record.parentReplyId),
    body: str(record.body) ?? '',
    createdAt: epoch(record.createdAt),
    identity: parseCommunityIdentity(record),
    status: contentStatus(record.status),
    isMine: bool(record.isMine),
    canDelete: bool(record.canDelete),
    canModerate: bool(record.canModerate),
  };
}

export function toCommunityReplyList(value: unknown): CommunityReplyCard[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toCommunityReplyCard(entry))
    .filter((entry): entry is CommunityReplyCard => entry !== null);
}

export function toCommunitySummary(value: unknown): CommunitySummary | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = str(record.id);
  const creatorId = str(record.creatorId);
  const name = str(record.name);
  if (!id || !creatorId || !name) return null;
  return {
    id,
    creatorId,
    name,
    description: str(record.description) ?? '',
    accessType: access(record.accessType),
    status: status(record.status),
    pseudonymousEnabled: bool(record.pseudonymousEnabled),
    rules: str(record.rules) ?? '',
    iconMedia: parseCommunityMedia(record.iconMedia),
    memberCount: num(record.memberCount) ?? 0,
    activeToday: num(record.activeToday) ?? 0,
    viewerAccess: bool(record.viewerAccess),
    viewerIsCreator: bool(record.viewerIsCreator),
    viewerIsMember: bool(record.viewerIsMember),
    viewerCanPost: bool(record.viewerCanPost),
    viewerCanAnnounce: bool(record.viewerCanAnnounce),
    viewerCanModerate: bool(record.viewerCanModerate),
    viewerPseudonym: str(record.viewerPseudonym),
    latestAnnouncement: toCommunityPostCard(record.latestAnnouncement),
  };
}

export function toCommunitySettings(row: {
  id: string;
  creator_id: string;
  vault_id: string;
  name: string;
  description: string;
  access_type: string;
  status: string;
  pseudonymous_enabled: boolean;
  rules: string;
  icon_media_object_id: string | null;
  created_at: string;
  updated_at: string;
}): CommunitySettings {
  return {
    id: row.id,
    creatorId: row.creator_id,
    vaultId: row.vault_id,
    name: row.name,
    description: row.description,
    accessType: access(row.access_type),
    status: status(row.status),
    pseudonymousEnabled: row.pseudonymous_enabled,
    rules: row.rules,
    iconMediaObjectId: row.icon_media_object_id,
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at),
  };
}
