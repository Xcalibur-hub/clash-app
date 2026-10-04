/**
 * Row → domain translation for the Vault, mirroring `services/arenaMappers.ts`:
 * Supabase rows never leak past this file, and every timestamp is a number by the
 * time a screen sees it (the rest of the app's `store/types.ts` speaks in epoch
 * milliseconds, not ISO strings).
 */

import type {
  CreatorVaultRow,
  VaultCollectionRow,
  VaultDropRow,
  VaultSubscriptionRow,
} from '../supabase/types';

/** Public media location for a free Drop — always the public bucket. */
export interface StorefrontMedia {
  bucket: string;
  path: string;
  kind: string;
}

/**
 * A Drop as the storefront sees it: metadata plus an access decision, never a
 * private media path. This is what the viewer's Vault renders, and what the
 * creator's management view renders (drafts included).
 *
 * `publicMedia` is present only for a FREE Drop the caller may read — free media
 * lives in the public bucket. A subscriber Drop keeps `publicMedia: null` and
 * loads private bytes through the signed-URL Edge Function on demand.
 *
 * `previewMedia` is an intentional public teaser the creator attached to a
 * subscriber Drop. It is never derived from private content.
 */
export interface StorefrontDrop {
  id: string;
  caption: string;
  accessLevel: 'free' | 'subscriber';
  status: 'draft' | 'published' | 'expired' | 'removed';
  createdAt: number;
  publishedAt: number | null;
  expiresAt: number | null;
  creatorId: string;
  vaultId: string;
  /** The server's single entitlement answer for the caller. */
  accessible: boolean;
  collectionIds: readonly string[];
  publicMedia: StorefrontMedia | null;
  /** Intentional public preview for subscriber Drops; null when absent. */
  previewMedia: StorefrontMedia | null;
}

/** A creator's Vault (one per creator — `creator_vaults.creator_id` is unique). */
export interface CreatorVault {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  status: CreatorVaultRow['status'];
  createdAt: number;
}

/**
 * One Vault Drop.
 *
 * `expiresAt` is the server-stamped 7-day window on the *feed*: once it passes,
 * the Drop stops appearing in live listings. It does not mean the content is
 * gone — an expired Drop is still readable through any Collection holding it,
 * and `status` ('expired') is the only thing that changes.
 */
export interface VaultDrop {
  id: string;
  vaultId: string;
  creatorId: string;
  caption: string;
  mediaObjectId: string | null;
  accessLevel: VaultDropRow['access_level'];
  status: VaultDropRow['status'];
  createdAt: number;
  publishedAt: number | null;
  expiresAt: number | null;
  /** Tombstone stamp — set when the creator retracts a Drop. */
  deletedAt: number | null;
}

/** A permanent creator shelf. Its items outlive a Drop's 7-day feed window. */
export interface VaultCollection {
  id: string;
  vaultId: string;
  creatorId: string;
  title: string;
  description: string;
  createdAt: number;
  drops: readonly VaultDrop[];
}

/** The viewer's own entitlement state for one Vault. Null status = never subscribed. */
export interface VaultSubscriptionState {
  vaultId: string;
  status: VaultSubscriptionRow['status'] | null;
  currentPeriodEnd: number | null;
  /** True only when the server would answer `can_access_vault_drop` with yes. */
  active: boolean;
}

function epoch(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

export function toCreatorVault(row: CreatorVaultRow): CreatorVault {
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: Date.parse(row.created_at),
  };
}

/** RPC returns may lag the table Row type when new nullable columns are added. */
type VaultDropRowLike = Omit<VaultDropRow, 'public_preview_media_object_id'> & {
  public_preview_media_object_id?: string | null;
};

export function toVaultDrop(row: VaultDropRowLike): VaultDrop {
  return {
    id: row.id,
    vaultId: row.vault_id,
    creatorId: row.creator_id,
    caption: row.caption,
    mediaObjectId: row.media_object_id,
    accessLevel: row.access_level,
    status: row.status,
    createdAt: Date.parse(row.created_at),
    publishedAt: epoch(row.published_at),
    expiresAt: epoch(row.expires_at),
    deletedAt: epoch(row.deleted_at),
  };
}

export function toVaultCollection(row: VaultCollectionRow, drops: readonly VaultDrop[]): VaultCollection {
  return {
    id: row.id,
    vaultId: row.vault_id,
    creatorId: row.creator_id,
    title: row.title,
    description: row.description,
    createdAt: Date.parse(row.created_at),
    drops,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asBool(value: unknown): boolean {
  return value === true;
}

/** Defensive parse of the `vault_drop_card` / `vault_storefront` JSON payloads. */
export function toStorefrontDrop(value: unknown): StorefrontDrop {
  const record = asRecord(value);
  if (!record) throw new Error('vault storefront returned an unexpected payload');

  const id = asString(record.id);
  const caption = asString(record.caption);
  const creatorId = asString(record.creatorId);
  const vaultId = asString(record.vaultId);
  if (!id || !caption || !creatorId || !vaultId) {
    throw new Error('vault storefront returned an unexpected payload');
  }

  const accessLevel = record.accessLevel === 'subscriber' ? 'subscriber' : 'free';
  const status =
    record.status === 'draft' ||
    record.status === 'published' ||
    record.status === 'expired' ||
    record.status === 'removed'
      ? record.status
      : 'draft';

  const mediaRecord = asRecord(record.publicMedia);
  const publicMedia: StorefrontMedia | null =
    mediaRecord && asString(mediaRecord.bucket) && asString(mediaRecord.path)
      ? {
          bucket: asString(mediaRecord.bucket) as string,
          path: asString(mediaRecord.path) as string,
          kind: asString(mediaRecord.kind) ?? 'image',
        }
      : null;

  const previewRecord = asRecord(record.previewMedia);
  const previewMedia: StorefrontMedia | null =
    previewRecord && asString(previewRecord.bucket) && asString(previewRecord.path)
      ? {
          bucket: asString(previewRecord.bucket) as string,
          path: asString(previewRecord.path) as string,
          kind: asString(previewRecord.kind) ?? 'image',
        }
      : null;

  const rawCollections = Array.isArray(record.collectionIds) ? record.collectionIds : [];
  const collectionIds = rawCollections.filter((entry): entry is string => typeof entry === 'string');

  return {
    id,
    caption,
    accessLevel,
    status,
    createdAt: Date.parse(asString(record.createdAt) ?? ''),
    publishedAt: asString(record.publishedAt) ? Date.parse(asString(record.publishedAt) as string) : null,
    expiresAt: asString(record.expiresAt) ? Date.parse(asString(record.expiresAt) as string) : null,
    creatorId,
    vaultId,
    accessible: asBool(record.accessible),
    collectionIds,
    publicMedia,
    previewMedia,
  };
}

/** Parse the whole storefront array; never trusts a partial row. */
export function toStorefrontList(value: unknown): StorefrontDrop[] {
  if (!Array.isArray(value)) return [];
  return value.map(toStorefrontDrop);
}

