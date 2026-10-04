import React from 'react';
import { followUser, unfollowUser } from '../../../services/socialService';
import { getPublicMediaUrl } from '../../../services/mediaService';
import { errorText } from '../../../services/supabaseClient';
import { analytics } from '../../../services/analytics';
import { resolveCreatorWorldModules, type CreatorWorldModule } from '../../../utils/vaultModules';
import { vaultPublicVisualMedia } from '../../../utils/vaultAccess';
import type { StorefrontDrop } from '../../../services/vaultMappers';
import {
  emptyCreatorWorldData,
  fetchCreatorWorld,
  type CreatorWorldData,
  type CreatorWorldPhase,
} from './creatorWorldLoader';

export type { CreatorWorldPhase } from './creatorWorldLoader';

export interface CreatorWorldModel {
  phase: CreatorWorldPhase;
  creator: CreatorWorldData['creator'];
  vault: CreatorWorldData['vault'];
  follow: CreatorWorldData['follow'];
  subscription: CreatorWorldData['subscription'];
  storefront: StorefrontDrop[];
  liveDrops: StorefrontDrop[];
  collections: CreatorWorldData['collections'];
  services: CreatorWorldData['services'];
  courses: CreatorWorldData['courses'];
  products: CreatorWorldData['products'];
  community: CreatorWorldData['community'];
  isSelf: boolean;
  modules: CreatorWorldModule[];
  heroUrl: string | null;
  posterUrl: string | null;
  posterLabel: string | null;
  toggleFollow: () => void;
}

function publicVisualUrl(drop: StorefrontDrop): string | null {
  const visual = vaultPublicVisualMedia({
    accessLevel: drop.accessLevel,
    accessible: drop.accessible,
    publicMedia: drop.publicMedia,
    previewMedia: drop.previewMedia,
  });
  return visual ? getPublicMediaUrl(visual.bucket, visual.path) : null;
}

/** All data + follow state for a Creator World. Composition lives elsewhere. */
export function useCreatorWorld(creatorId: string): CreatorWorldModel {
  const [data, setData] = React.useState<CreatorWorldData | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const next = await fetchCreatorWorld(creatorId);
      setData(next);
      if (next.phase === 'ready') {
        analytics.trackOnce(`vault_opened:${creatorId}`, 'vault_opened', {
          realm: 'vault',
          is_creator: next.isSelf,
          is_guest: next.isGuest,
        });
      }
    } catch (error) {
      void errorText(error);
      setData(emptyCreatorWorldData('error'));
    }
  }, [creatorId]);

  React.useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  const toggleFollow = React.useCallback((): void => {
    setData((prev) => {
      if (!prev?.follow) return prev;
      const follow = prev.follow;
      const next = follow.following ? unfollowUser(creatorId) : followUser(creatorId);
      void next.catch(() => setData((current) => (current ? { ...current, follow } : current)));
      return { ...prev, follow: { ...follow, following: !follow.following } };
    });
  }, [creatorId]);

  const liveDrops = React.useMemo(
    () =>
      (data?.storefront ?? []).filter(
        (drop) =>
          drop.status === 'published' ||
          (drop.status === 'expired' && drop.collectionIds.length > 0),
      ),
    [data?.storefront],
  );

  const modules = React.useMemo(
    () =>
      resolveCreatorWorldModules({
        contentCount: liveDrops.length,
        collectionCount: data?.collections.length ?? 0,
        serviceCount: data?.services.length ?? 0,
        courseCount: data?.courses.length ?? 0,
        storeCount: data?.products.length ?? 0,
        communityReady: (data?.community ?? null) !== null,
      }),
    [liveDrops.length, data?.collections.length, data?.services.length, data?.courses.length, data?.products.length, data?.community],
  );

  const heroUrl = React.useMemo(() => {
    for (const drop of liveDrops) {
      const url = publicVisualUrl(drop);
      if (url) return url;
    }
    return null;
  }, [liveDrops]);

  const poster = React.useMemo(() => {
    const drop = liveDrops[0];
    if (!drop) return { url: null as string | null, label: null as string | null };
    return { url: publicVisualUrl(drop), label: drop.caption };
  }, [liveDrops]);

  const fallback = data ?? emptyCreatorWorldData('loading');

  return {
    phase: fallback.phase,
    creator: fallback.creator,
    vault: fallback.vault,
    follow: fallback.follow,
    subscription: fallback.subscription,
    storefront: fallback.storefront,
    liveDrops,
    collections: fallback.collections,
    services: fallback.services,
    courses: fallback.courses,
    products: fallback.products,
    community: fallback.community,
    isSelf: fallback.isSelf,
    modules,
    heroUrl,
    posterUrl: poster.url,
    posterLabel: poster.label,
    toggleFollow,
  };
}