import type { User } from '../../../store';
import { currentViewerProfileId } from '../../../services/apiService';
import { fetchProfileById } from '../../../services/profileService';
import { fetchFollowState, type FollowState } from '../../../services/socialService';
import { fetchViewerSafetyState } from '../../../services/safetyService';
import {
  fetchCollections,
  fetchStorefront,
  fetchSubscriptionState,
  fetchVault,
} from '../../../services/vaultService';
import {
  fetchCreatorCourses,
  fetchCreatorProducts,
  fetchCreatorServices,
} from '../../../services/vaultCommerceService';
import { fetchCreatorCommunity } from '../../../services/vaultCommunityService';
import type { CommunitySummary } from '../../../services/vaultCommunityMappers';
import type {
  CreatorVault,
  StorefrontDrop,
  VaultCollection,
  VaultSubscriptionState,
} from '../../../services/vaultMappers';
import type { CreatorCourse, CreatorProduct, CreatorService } from '../../../services/vaultCommerceMappers';

export type CreatorWorldPhase = 'loading' | 'ready' | 'none' | 'blocked' | 'error';

export interface CreatorWorldData {
  phase: CreatorWorldPhase;
  creator: User | null;
  vault: CreatorVault | null;
  follow: FollowState | null;
  subscription: VaultSubscriptionState | null;
  storefront: StorefrontDrop[];
  collections: VaultCollection[];
  services: CreatorService[];
  courses: CreatorCourse[];
  products: CreatorProduct[];
  community: CommunitySummary | null;
  isSelf: boolean;
  isGuest: boolean;
}

export function emptyCreatorWorldData(phase: CreatorWorldPhase): CreatorWorldData {
  return {
    phase,
    creator: null,
    vault: null,
    follow: null,
    subscription: null,
    storefront: [],
    collections: [],
    services: [],
    courses: [],
    products: [],
    community: null,
    isSelf: false,
    isGuest: true,
  };
}

/** Loads a Creator World. Returns a phase; the hook owns the UI state. */
export async function fetchCreatorWorld(creatorId: string): Promise<CreatorWorldData> {
  const me = await currentViewerProfileId();
  const [profile, followState, safety, vault] = await Promise.all([
    fetchProfileById(creatorId),
    fetchFollowState(creatorId),
    fetchViewerSafetyState(me),
    fetchVault(creatorId),
  ]);
  const base = { ...emptyCreatorWorldData('ready'), creator: profile, follow: followState, vault, isSelf: me === creatorId, isGuest: me === null };
  if (!profile) return { ...emptyCreatorWorldData('error') };
  if (!vault) return { ...base, phase: 'none' };

  const blocked =
    safety.blockedProfileIds.includes(creatorId) || safety.blockingProfileIds.includes(creatorId);
  if (blocked) return { ...base, phase: 'blocked' };

  const [drops, cols, subs, services, courses, products, community] = await Promise.all([
    fetchStorefront(vault.id),
    fetchCollections(vault.id),
    fetchSubscriptionState(vault.id),
    fetchCreatorServices(creatorId),
    fetchCreatorCourses(creatorId),
    fetchCreatorProducts(creatorId),
    fetchCreatorCommunity(creatorId),
  ]);

  return {
    ...base,
    subscription: subs,
    storefront: drops,
    collections: cols,
    services,
    courses,
    products,
    community,
  };
}
