/**
 * Pure Vault home composition helpers — empty vs error, module visibility,
 * follow filtering. No network; safe for unit tests.
 */

import type { VaultOfferAccess } from './vaultMoney';

export type VaultHomeScope = 'following' | 'discover';

export interface VaultHomeDropLike {
  id: string;
  dropId: string;
  creatorId: string;
  caption: string;
  accessLevel: 'free' | 'preview';
  mediaUrl: string | null;
  mediaKind: string | null;
  authorHandle: string;
  authorName: string;
  authorTint: string;
  score: number;
  vaultId: string;
}

export interface VaultCreatorWorldLike {
  creatorId: string;
  handle: string;
  name: string;
  tint: string;
  bio: string | null;
  vaultId: string | null;
  latestCaption: string | null;
  latestAccess: 'free' | 'preview' | null;
  mediaUrl: string | null;
  hasServices?: boolean;
  hasCourses?: boolean;
  hasProducts?: boolean;
  hasCollections?: boolean;
  dropCount?: number;
}

export interface VaultHomeOfferLike {
  id: string;
  kind: 'service' | 'course' | 'product';
  creatorId: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  accessType: VaultOfferAccess;
  priceAmountMinor: number | null;
  currency: string | null;
  externalUrl: string | null;
  authorHandle: string;
  authorName: string;
}

export interface VaultHomeComposeInput {
  scope: VaultHomeScope;
  followingIds: readonly string[];
  blockedIds: ReadonlySet<string>;
  drops: readonly VaultHomeDropLike[];
  worlds: readonly VaultCreatorWorldLike[];
  services: readonly VaultHomeOfferLike[];
  courses: readonly VaultHomeOfferLike[];
  products: readonly VaultHomeOfferLike[];
  continueItems: readonly VaultHomeDropLike[];
  canCreate: boolean;
}

export interface VaultHomeComposed {
  scope: VaultHomeScope;
  todaysDrops: VaultHomeDropLike[];
  yourCreators: VaultCreatorWorldLike[];
  continueItems: VaultHomeDropLike[];
  discoverWorlds: VaultCreatorWorldLike[];
  discoverServices: VaultHomeOfferLike[];
  discoverCourses: VaultHomeOfferLike[];
  discoverProducts: VaultHomeOfferLike[];
  canCreate: boolean;
  isEmpty: boolean;
  followingEmpty: boolean;
}

export function excludeBlockedCreators<T extends { creatorId: string }>(
  items: readonly T[],
  blocked: ReadonlySet<string>,
): T[] {
  return items.filter((item) => item.creatorId && !blocked.has(item.creatorId));
}

export function filterFollowingDrops(
  drops: readonly VaultHomeDropLike[],
  followingIds: ReadonlySet<string>,
): VaultHomeDropLike[] {
  if (followingIds.size === 0) return [];
  return drops.filter((drop) => followingIds.has(drop.creatorId));
}

export function vaultHomeIsEmpty(model: {
  todaysDrops: readonly unknown[];
  yourCreators: readonly unknown[];
  discoverWorlds: readonly unknown[];
  discoverServices?: readonly unknown[];
  discoverCourses?: readonly unknown[];
  discoverProducts?: readonly unknown[];
  continueItems?: readonly unknown[];
}): boolean {
  return (
    model.todaysDrops.length === 0 &&
    model.yourCreators.length === 0 &&
    model.discoverWorlds.length === 0 &&
    (model.discoverServices?.length ?? 0) === 0 &&
    (model.discoverCourses?.length ?? 0) === 0 &&
    (model.discoverProducts?.length ?? 0) === 0 &&
    (model.continueItems?.length ?? 0) === 0
  );
}

/** Query failure must never be rendered as an empty Discover shelf. */
export type VaultHomeLoadOutcome<T> =
  | { status: 'ok'; model: T }
  | { status: 'error'; message: string }
  | { status: 'empty'; model: T };

export function classifyVaultHomeLoad<T extends { isEmpty: boolean }>(
  result: { ok: true; model: T } | { ok: false; message: string },
): VaultHomeLoadOutcome<T> {
  if (!result.ok) return { status: 'error', message: result.message };
  if (result.model.isEmpty) return { status: 'empty', model: result.model };
  return { status: 'ok', model: result.model };
}

export function composeVaultHome(input: VaultHomeComposeInput): VaultHomeComposed {
  const following = new Set(input.followingIds);
  const drops = excludeBlockedCreators(input.drops, input.blockedIds);
  const worlds = excludeBlockedCreators(input.worlds, input.blockedIds);
  const services = excludeBlockedCreators(input.services, input.blockedIds);
  const courses = excludeBlockedCreators(input.courses, input.blockedIds);
  const products = excludeBlockedCreators(input.products, input.blockedIds);

  const followingDrops = filterFollowingDrops(drops, following);
  const followingWorlds = worlds.filter((w) => following.has(w.creatorId));

  const todaysDrops =
    input.scope === 'following' ? followingDrops.slice(0, 12) : drops.slice(0, 12);

  const yourCreators = input.scope === 'following' ? followingWorlds.slice(0, 12) : [];
  const discoverWorlds = input.scope === 'discover' ? worlds.slice(0, 10) : [];

  const discoverServices = input.scope === 'discover' ? services.slice(0, 8) : [];
  const discoverCourses = input.scope === 'discover' ? courses.slice(0, 8) : [];
  const discoverProducts = input.scope === 'discover' ? products.slice(0, 8) : [];

  // CONTINUE only when real progress rows were supplied — never invent from drops.
  const continueItems = input.continueItems.slice(0, 4);

  const model: VaultHomeComposed = {
    scope: input.scope,
    todaysDrops,
    yourCreators,
    continueItems: input.scope === 'following' ? continueItems : [],
    discoverWorlds,
    discoverServices,
    discoverCourses,
    discoverProducts,
    canCreate: input.canCreate,
    isEmpty: false,
    followingEmpty: false,
  };

  model.isEmpty = vaultHomeIsEmpty(model);
  model.followingEmpty =
    input.scope === 'following' && following.size === 0 && model.isEmpty
      ? true
      : input.scope === 'following' && model.isEmpty;

  return model;
}

export function moduleSectionsActive(signals: {
  dropCount: number;
  collectionCount: number;
  serviceCount: number;
  courseCount: number;
  storeCount: number;
}): {
  content: boolean;
  collections: boolean;
  services: boolean;
  learn: boolean;
  shop: boolean;
} {
  return {
    content: signals.dropCount > 0,
    collections: signals.collectionCount > 0,
    services: signals.serviceCount > 0,
    learn: signals.courseCount > 0,
    shop: signals.storeCount > 0,
  };
}

/** Guard used by local seed runners — must never accept hosted URLs. */
export function isLocalSupabaseApiUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /127\.0\.0\.1|localhost/i.test(url);
}
