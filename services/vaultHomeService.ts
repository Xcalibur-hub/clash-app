/**
 * Vault home composition — Creator Worlds discovery surface.
 * Discover uses list_vault_discover_worlds (no follows required).
 * Never falls back to mock/fixture content on query failure.
 */

import { diversifyVaultByCreator } from '../utils/vaultHomeRank';
import {
  composeVaultHome,
  type VaultCreatorWorldLike,
  type VaultHomeDropLike,
  type VaultHomeOfferLike,
  type VaultHomeScope,
} from '../utils/vaultHomeCompose';
import { currentViewerProfileId } from './apiService';
import {
  fetchExploreVaultPreviews,
  type ExploreVaultPreview,
} from './exploreService';
import { getPublicMediaUrl } from './mediaService';
import { fetchViewerSafetyState } from './safetyService';
import { fetchFollowingIds } from './socialService';
import { requestError, requireSupabase, SupabaseError } from './supabaseClient';
import type { VaultOfferAccess } from '../utils/vaultMoney';

export type { VaultHomeScope };

export interface VaultHomeDropCard extends VaultHomeDropLike {}
export interface VaultCreatorWorldCard extends VaultCreatorWorldLike {}
export interface VaultHomeOfferCard extends VaultHomeOfferLike {}

export interface VaultHomeModel {
  scope: VaultHomeScope;
  todaysDrops: VaultHomeDropCard[];
  yourCreators: VaultCreatorWorldCard[];
  continueItems: VaultHomeDropCard[];
  discoverWorlds: VaultCreatorWorldCard[];
  discoverServices: VaultHomeOfferCard[];
  discoverCourses: VaultHomeOfferCard[];
  discoverProducts: VaultHomeOfferCard[];
  canCreate: boolean;
  isEmpty: boolean;
  followingEmpty: boolean;
}

function publicPathUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  try {
    return getPublicMediaUrl('public-media', path);
  } catch {
    return null;
  }
}

function toHomeDrop(preview: ExploreVaultPreview, rankIndex: number): VaultHomeDropCard {
  return {
    id: preview.dropId,
    dropId: preview.dropId,
    vaultId: preview.vaultId,
    creatorId: preview.creatorId,
    caption: preview.title,
    accessLevel: preview.accessLevel,
    mediaUrl: preview.mediaUrl,
    mediaKind: preview.mediaKind,
    authorHandle: preview.authorHandle,
    authorName: preview.authorName,
    authorTint: preview.authorTint,
    score: 1000 - rankIndex + (preview.accessLevel === 'free' ? 1 : 0),
  };
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

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toWorld(raw: unknown): VaultCreatorWorldCard | null {
  const r = asRecord(raw);
  if (!r) return null;
  const creatorId = str(r.creatorId);
  if (!creatorId) return null;
  const access = str(r.latestAccess);
  return {
    creatorId,
    handle: str(r.handle) ?? '',
    name: str(r.name) ?? 'Creator',
    tint: str(r.tint) ?? '#A1A1AA',
    bio: str(r.bio),
    vaultId: str(r.vaultId),
    latestCaption: str(r.latestCaption),
    latestAccess: access === 'preview' || access === 'free' ? access : null,
    mediaUrl: publicPathUrl(str(r.publicMediaPath)),
    hasServices: bool(r.hasServices),
    hasCourses: bool(r.hasCourses),
    hasProducts: bool(r.hasProducts),
    hasCollections: bool(r.hasCollections),
    dropCount: num(r.dropCount) ?? 0,
  };
}

function toOffer(raw: unknown): VaultHomeOfferCard | null {
  const r = asRecord(raw);
  if (!r) return null;
  const id = str(r.id);
  const kind = str(r.kind);
  const creatorId = str(r.creatorId);
  if (!id || !creatorId || (kind !== 'service' && kind !== 'course' && kind !== 'product')) {
    return null;
  }
  const access = str(r.accessType) as VaultOfferAccess | null;
  return {
    id,
    kind,
    creatorId,
    title: str(r.title) ?? 'Offer',
    subtitle: str(r.subtitle),
    coverUrl: publicPathUrl(str(r.publicMediaPath)),
    accessType: access ?? 'free',
    priceAmountMinor: num(r.priceAmountMinor),
    currency: str(r.currency),
    externalUrl: str(r.externalUrl),
    authorHandle: str(r.authorHandle) ?? '',
    authorName: str(r.authorName) ?? '',
  };
}

async function fetchDiscoverWorlds(limit = 12): Promise<VaultCreatorWorldCard[]> {
  const { data, error } = await requireSupabase().rpc('list_vault_discover_worlds', {
    p_limit: limit,
  });
  if (error) throw requestError(error);
  if (!Array.isArray(data)) throw new SupabaseError('discover worlds unavailable', 'bad_payload');
  const out: VaultCreatorWorldCard[] = [];
  for (const row of data) {
    const world = toWorld(row);
    if (world) out.push(world);
  }
  return out;
}

async function fetchDiscoverOffers(
  kind: 'service' | 'course' | 'product',
  limit = 8,
): Promise<VaultHomeOfferCard[]> {
  const { data, error } = await requireSupabase().rpc('list_vault_discover_offers', {
    p_kind: kind,
    p_limit: limit,
  });
  if (error) throw requestError(error);
  if (!Array.isArray(data)) throw new SupabaseError('discover offers unavailable', 'bad_payload');
  const out: VaultHomeOfferCard[] = [];
  for (const row of data) {
    const offer = toOffer(row);
    if (offer) out.push(offer);
  }
  return out;
}

/** Compose Vault home from Discover worlds + Explore drop previews + commerce. */
export async function fetchVaultHome(scope: VaultHomeScope = 'discover'): Promise<VaultHomeModel> {
  const me = await currentViewerProfileId();
  const [previews, worlds, services, courses, products, safety, followingIds] = await Promise.all([
    fetchExploreVaultPreviews(24),
    fetchDiscoverWorlds(16),
    fetchDiscoverOffers('service', 8),
    fetchDiscoverOffers('course', 8),
    fetchDiscoverOffers('product', 8),
    me
      ? fetchViewerSafetyState(me)
      : Promise.resolve({
          blockedProfileIds: [] as string[],
          blockingProfileIds: [] as string[],
          mutedProfileIds: [] as string[],
        }),
    me ? fetchFollowingIds(me) : Promise.resolve([] as string[]),
  ]);

  const blocked = new Set<string>([...safety.blockedProfileIds, ...safety.blockingProfileIds]);
  const ranked = diversifyVaultByCreator(
    previews.map((p, index) => toHomeDrop(p, index)),
    24,
  );

  // Enrich Following shelf: prefer discover-world cards for followed creators.
  const worldByCreator = new Map(worlds.map((w) => [w.creatorId, w]));
  const followingWorlds: VaultCreatorWorldCard[] = [];
  for (const id of followingIds) {
    if (blocked.has(id)) continue;
    const existing = worldByCreator.get(id);
    if (existing) {
      followingWorlds.push(existing);
      continue;
    }
    const drop = ranked.find((d) => d.creatorId === id);
    if (!drop) continue;
    followingWorlds.push({
      creatorId: id,
      handle: drop.authorHandle,
      name: drop.authorName,
      tint: drop.authorTint,
      bio: null,
      vaultId: drop.vaultId,
      latestCaption: drop.caption,
      latestAccess: drop.accessLevel,
      mediaUrl: drop.mediaUrl,
    });
  }

  const composed = composeVaultHome({
    scope,
    followingIds,
    blockedIds: blocked,
    drops: ranked,
    worlds: scope === 'following' ? followingWorlds : worlds,
    services,
    courses,
    products,
    continueItems: [],
    canCreate: Boolean(me),
  });

  return composed;
}
