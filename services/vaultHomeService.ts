/**
 * Vault home composition — Creator Worlds discovery surface.
 * Reuses Explore FREE/PREVIEW previews + social following. No fake popularity.
 */

import type { User } from '../store';
import { diversifyVaultByCreator } from '../utils/vaultHomeRank';
import { currentViewerProfileId, fetchProfilesByIds } from './apiService';
import {
  fetchExploreVaultPreviews,
  type ExploreVaultPreview,
} from './exploreService';
import { fetchViewerSafetyState } from './safetyService';
import { fetchFollowingIds } from './socialService';
import { fetchActiveVaultsForCreators } from './vaultService';

export type VaultHomeScope = 'following' | 'discover';

export interface VaultHomeDropCard {
  /** Alias of dropId for ranking helpers. */
  id: string;
  dropId: string;
  vaultId: string;
  creatorId: string;
  caption: string;
  accessLevel: 'free' | 'preview';
  mediaUrl: string | null;
  mediaKind: string | null;
  authorHandle: string;
  authorName: string;
  authorTint: string;
  score: number;
}

export interface VaultCreatorWorldCard {
  creatorId: string;
  handle: string;
  name: string;
  tint: string;
  bio: string | null;
  vaultId: string | null;
  latestCaption: string | null;
  latestAccess: 'free' | 'preview' | null;
  mediaUrl: string | null;
}

export interface VaultHomeModel {
  scope: VaultHomeScope;
  todaysDrops: VaultHomeDropCard[];
  yourCreators: VaultCreatorWorldCard[];
  continueItems: VaultHomeDropCard[];
  discoverWorlds: VaultCreatorWorldCard[];
  canCreate: boolean;
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
    // Explore already returns a freshness-leaning order; preserve with small free boost.
    score: 1000 - rankIndex + (preview.accessLevel === 'free' ? 1 : 0),
  };
}

function uniqueCreators(drops: readonly VaultHomeDropCard[], profiles: Map<string, User>, max: number): VaultCreatorWorldCard[] {
  const seen = new Set<string>();
  const out: VaultCreatorWorldCard[] = [];
  for (const drop of drops) {
    if (seen.has(drop.creatorId)) continue;
    seen.add(drop.creatorId);
    out.push({
      creatorId: drop.creatorId,
      handle: drop.authorHandle,
      name: drop.authorName,
      tint: drop.authorTint,
      bio: profiles.get(drop.creatorId)?.bio ?? null,
      vaultId: drop.vaultId,
      latestCaption: drop.caption,
      latestAccess: drop.accessLevel,
      mediaUrl: drop.mediaUrl,
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Compose Vault home from existing Explore + social primitives. */
export async function fetchVaultHome(scope: VaultHomeScope = 'discover'): Promise<VaultHomeModel> {
  const me = await currentViewerProfileId();
  const [previews, safety, followingIds] = await Promise.all([
    fetchExploreVaultPreviews(24),
    me
      ? fetchViewerSafetyState(me)
      : Promise.resolve({ blockedProfileIds: [] as string[], blockingProfileIds: [] as string[], mutedProfileIds: [] as string[] }),
    me ? fetchFollowingIds(me) : Promise.resolve([] as string[]),
  ]);

  const blocked = new Set<string>([...safety.blockedProfileIds, ...safety.blockingProfileIds]);
  const following = new Set(followingIds);

  const visible = previews.filter((p) => !blocked.has(p.creatorId));
  const ranked = diversifyVaultByCreator(
    visible.map((p, index) => toHomeDrop(p, index)),
    24,
  );

  const followingDrops = diversifyVaultByCreator(
    ranked.filter((d) => following.has(d.creatorId)),
    16,
  );

  const todaysDrops = scope === 'following' ? followingDrops : ranked.slice(0, 12);

  const creatorIds = [...new Set(ranked.map((d) => d.creatorId))].slice(0, 24);
  const profiles = await fetchProfilesByIds(creatorIds);
  const byId = new Map(profiles.map((p) => [p.id, p]));

  let yourCreators: VaultCreatorWorldCard[] = [];
  if (followingIds.length > 0) {
    const ids = followingIds.filter((id) => !blocked.has(id)).slice(0, 20);
    const [followedProfiles, vaults] = await Promise.all([
      fetchProfilesByIds(ids),
      fetchActiveVaultsForCreators(ids),
    ]);
    const vaultByCreator = new Map(vaults.map((v) => [v.creatorId, v]));
    yourCreators = followedProfiles
      .filter((profile) => vaultByCreator.has(profile.id))
      .map((profile) => {
        const latest = ranked.find((d) => d.creatorId === profile.id);
        return {
          creatorId: profile.id,
          handle: profile.handle,
          name: profile.name,
          tint: profile.tint,
          bio: profile.bio ?? null,
          vaultId: vaultByCreator.get(profile.id)?.id ?? null,
          latestCaption: latest?.caption ?? null,
          latestAccess: latest?.accessLevel ?? null,
          mediaUrl: latest?.mediaUrl ?? null,
        };
      })
      .slice(0, 12);
  }

  const continueItems = followingDrops.slice(0, 6);
  const discoverWorlds = uniqueCreators(scope === 'discover' ? ranked : followingDrops, byId, 10);

  return {
    scope,
    todaysDrops,
    yourCreators,
    continueItems,
    discoverWorlds,
    canCreate: Boolean(me),
  };
}
