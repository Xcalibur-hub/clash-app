import React from 'react';
import { getPublicMediaUrl } from '../../../services/mediaService';
import { useAuth } from '../../../store/AuthProvider';
import { useCreatorWorldFollow } from './useCreatorWorldFollow';
import { useRetryableRead } from '../../../hooks/useRetryableRead';
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
  worldDrops: CreatorWorldData['worldDrops'];
  liveSessions: CreatorWorldData['liveSessions'];
  aiProfile: CreatorWorldData['aiProfile'];
  isSelf: boolean;
  modules: CreatorWorldModule[];
  heroUrl: string | null;
  posterUrl: string | null;
  posterLabel: string | null;
  toggleFollow: () => void;
  retry: () => void;
  followBusy: boolean;
  followError: boolean;
  isGuest: boolean;
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
  const { user } = useAuth();
  const scope = `${user?.id ?? 'guest'}:${creatorId}`;
  const load = React.useCallback(() => fetchCreatorWorld(creatorId), [creatorId]);
  const read = useRetryableRead(load, scope);
  const data = read.data;
  const { following, toggleFollow, busy, error } = useCreatorWorldFollow(creatorId, scope, data, Boolean(user));
  React.useEffect(() => {
    if (data?.phase === 'ready') analytics.trackOnce(`vault_opened:${creatorId}`, 'vault_opened', {
      realm: 'vault', is_creator: data.isSelf, is_guest: data.isGuest,
    });
  }, [data, creatorId]);

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
        worldDropCount: data?.worldDrops.length ?? 0,
        liveReady: (data?.liveSessions ?? []).some(
          (session) => session.status === 'LIVE' || session.status === 'SCHEDULED',
        ),
        aiReady: (data?.aiProfile ?? null) !== null && data?.aiProfile?.enabled === true,
      }),
    [
      liveDrops.length,
      data?.collections.length,
      data?.services.length,
      data?.courses.length,
      data?.products.length,
      data?.community,
      data?.worldDrops.length,
      data?.liveSessions,
      data?.aiProfile,
    ],
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

  const fallback = data ?? emptyCreatorWorldData(read.status === 'loading' ? 'loading' : read.status === 'denied' ? 'blocked' : 'error');

  return {
    phase: fallback.phase,
    creator: fallback.creator,
    vault: fallback.vault,
    follow: fallback.follow ? { ...fallback.follow, following } : null,
    subscription: fallback.subscription,
    storefront: fallback.storefront,
    liveDrops,
    collections: fallback.collections,
    services: fallback.services,
    courses: fallback.courses,
    products: fallback.products,
    community: fallback.community,
    worldDrops: fallback.worldDrops,
    liveSessions: fallback.liveSessions,
    aiProfile: fallback.aiProfile,
    isSelf: fallback.isSelf,
    modules,
    heroUrl,
    posterUrl: poster.url,
    posterLabel: poster.label,
    toggleFollow,
    retry: read.retry,
    followBusy: busy,
    followError: error,
    isGuest: fallback.isGuest,
  };
}
