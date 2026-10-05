/**
 * Creator World row composition (Phase 15.2B) — pure and testable.
 *
 * The screen renders these rows; all media/access resolution is injected so the
 * composition rules can be unit-tested without a database.
 */

import type { CreatorModuleType } from './vaultModules';
import type { WorldPersonality } from './vaultWorldPersonality';
import type { StorefrontDrop, VaultCollection } from '../services/vaultMappers';
import type { CreatorCourse, CreatorProduct, CreatorService } from '../services/vaultCommerceMappers';
import type { CreatorWorldDrop } from '../services/creatorWorldDropMappers';

export interface WorldDropItem {
  id: string;
  title: string;
  mediaUrl: string | null;
  tint: string | null;
  access: string;
  meta: string | null;
}

export interface WorldCollectionItem {
  id: string;
  title: string;
  description: string;
  count: number;
  drops: WorldDropItem[];
}

export interface WorldOfferItem {
  id: string;
  title: string;
  subtitle: string | null;
  mediaUrl: string | null;
  tint: string | null;
  meta: string;
}

export interface WorldDropChapterItem {
  id: string;
  caption: string;
  mediaUrl: string | null;
  tint: string | null;
  place: string | null;
  type: string;
  claimed: boolean;
}

export type WorldRow =
  | { kind: 'chapter'; index: number; module: CreatorModuleType; title: string; count: number | null }
  | { kind: 'drops'; drops: WorldDropItem[]; personality: WorldPersonality }
  | { kind: 'collections'; collections: WorldCollectionItem[] }
  | { kind: 'services'; items: WorldOfferItem[] }
  | { kind: 'courses'; items: WorldOfferItem[] }
  | { kind: 'products'; items: WorldOfferItem[] }
  | { kind: 'community' }
  | { kind: 'worldDrops'; items: WorldDropChapterItem[] }
  | { kind: 'empty' };

export interface WorldRowsInput {
  modules: readonly { type: CreatorModuleType }[];
  drops: readonly StorefrontDrop[];
  collections: readonly VaultCollection[];
  services: readonly CreatorService[];
  courses: readonly CreatorCourse[];
  products: readonly CreatorProduct[];
  worldDrops: readonly CreatorWorldDrop[];
  communityReady: boolean;
  personality: WorldPersonality;
}

export interface WorldRowsDeps {
  chapterTitle: (module: CreatorModuleType, creatorName: string) => string;
  creatorName: string;
  dropMedia: (drop: StorefrontDrop) => string | null;
  dropAccess: (drop: StorefrontDrop) => string;
  collectionDrops: (
    collection: VaultCollection,
    all: readonly StorefrontDrop[],
  ) => readonly StorefrontDrop[];
  serviceMedia: (service: CreatorService) => string | null;
  courseMedia: (course: CreatorCourse) => string | null;
  productMedia: (product: CreatorProduct) => string | null;
  worldDropMedia: (drop: CreatorWorldDrop) => string | null;
  priceLabel: (input: {
    accessType: string;
    priceAmountMinor: number | null;
    currency: string | null;
    externalUrl?: string | null;
  }) => string;
}

function toDropItem(drop: StorefrontDrop, deps: WorldRowsDeps): WorldDropItem {
  return {
    id: drop.id,
    title: drop.caption,
    mediaUrl: deps.dropMedia(drop),
    tint: null,
    access: deps.dropAccess(drop),
    meta: null,
  };
}

/** Turn the world model into the ordered composition rows. */
export function buildWorldRows(input: WorldRowsInput, deps: WorldRowsDeps): WorldRow[] {
  if (input.modules.length === 0) return [{ kind: 'empty' }];

  const rows: WorldRow[] = [];
  let chapterIndex = 0;

  for (const mod of input.modules) {
    chapterIndex += 1;
    const title = deps.chapterTitle(mod.type, deps.creatorName);

    if (mod.type === 'CONTENT') {
      rows.push({
        kind: 'chapter',
        index: chapterIndex,
        module: mod.type,
        title,
        count: input.drops.length,
      });
      rows.push({
        kind: 'drops',
        personality: input.personality,
        drops: input.drops.map((drop) => toDropItem(drop, deps)),
      });
      continue;
    }

    if (mod.type === 'COLLECTIONS') {
      rows.push({
        kind: 'chapter',
        index: chapterIndex,
        module: mod.type,
        title,
        count: input.collections.length,
      });
      rows.push({
        kind: 'collections',
        collections: input.collections.map((collection) => {
          const drops = deps.collectionDrops(collection, input.drops);
          return {
            id: collection.id,
            title: collection.title,
            description: collection.description,
            count: drops.length,
            drops: drops.map((drop) => toDropItem(drop, deps)),
          };
        }),
      });
      continue;
    }

    if (mod.type === 'SERVICES') {
      rows.push({
        kind: 'chapter',
        index: chapterIndex,
        module: mod.type,
        title,
        count: input.services.length,
      });
      rows.push({
        kind: 'services',
        items: input.services.map((service) => ({
          id: service.id,
          title: service.title,
          subtitle: service.description || null,
          mediaUrl: deps.serviceMedia(service),
          tint: null,
          meta: [
            service.deliveryType === 'in_person'
              ? 'In person'
              : service.deliveryType === 'external'
                ? 'External'
                : 'Online',
            deps.priceLabel({
              accessType: service.accessType,
              priceAmountMinor: service.priceAmountMinor,
              currency: service.currency,
              externalUrl: service.externalUrl,
            }),
          ].join(' · '),
        })),
      });
      continue;
    }

    if (mod.type === 'COURSES') {
      rows.push({
        kind: 'chapter',
        index: chapterIndex,
        module: mod.type,
        title,
        count: input.courses.length,
      });
      rows.push({
        kind: 'courses',
        items: input.courses.map((course) => ({
          id: course.id,
          title: course.title,
          subtitle: course.description || null,
          mediaUrl: deps.courseMedia(course),
          tint: null,
          meta: [
            course.lessonCount > 0
              ? `${course.lessonCount} lesson${course.lessonCount === 1 ? '' : 's'}`
              : null,
            deps.priceLabel({
              accessType: course.accessType,
              priceAmountMinor: course.priceAmountMinor,
              currency: course.currency,
            }),
          ]
            .filter(Boolean)
            .join(' · '),
        })),
      });
      continue;
    }

    if (mod.type === 'STORE') {
      rows.push({
        kind: 'chapter',
        index: chapterIndex,
        module: mod.type,
        title,
        count: input.products.length,
      });
      rows.push({
        kind: 'products',
        items: input.products.map((product) => ({
          id: product.id,
          title: product.title,
          subtitle: null,
          mediaUrl: deps.productMedia(product),
          tint: null,
          meta: deps.priceLabel({
            accessType: product.accessType,
            priceAmountMinor: product.priceAmountMinor,
            currency: product.currency,
            externalUrl: product.externalUrl,
          }),
        })),
      });
      continue;
    }

    if (mod.type === 'COMMUNITY' && input.communityReady) {
      rows.push({ kind: 'chapter', index: chapterIndex, module: mod.type, title, count: null });
      rows.push({ kind: 'community' });
      continue;
    }

    if (mod.type === 'WORLD_DROPS' && input.worldDrops.length > 0) {
      rows.push({
        kind: 'chapter',
        index: chapterIndex,
        module: mod.type,
        title,
        count: input.worldDrops.length,
      });
      rows.push({
        kind: 'worldDrops',
        items: input.worldDrops.map((drop) => ({
          id: drop.id,
          caption: drop.caption,
          mediaUrl: deps.worldDropMedia(drop),
          tint: drop.creatorTint,
          place: drop.locationLabel,
          type: drop.dropType,
          claimed: drop.claimed,
        })),
      });
    }
  }

  return rows.length > 0 ? rows : [{ kind: 'empty' }];
}
