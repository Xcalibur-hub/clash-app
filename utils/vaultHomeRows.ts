/**
 * Vault Home row composition (Phase 15.2B) — pure and testable.
 * Groups offers into single editorial chapters instead of stacked cards.
 */

import type {
  VaultCreatorWorldCard,
  VaultHomeDropCard,
  VaultHomeModel,
  VaultHomeOfferCard,
  VaultHomeScope,
} from '../services/vaultHomeService';

export type HomeRow =
  | { kind: 'masthead' }
  | { kind: 'scope' }
  | { kind: 'chapter'; title: string }
  | { kind: 'featured'; creator: VaultCreatorWorldCard }
  | { kind: 'collage'; worlds: VaultCreatorWorldCard[] }
  | { kind: 'rail'; items: VaultCreatorWorldCard[] }
  | { kind: 'today'; drop: VaultHomeDropCard }
  | { kind: 'dropStrip'; drops: VaultHomeDropCard[] }
  | { kind: 'courses'; offers: VaultHomeOfferCard[] }
  | { kind: 'services'; offers: VaultHomeOfferCard[] }
  | { kind: 'products'; offers: VaultHomeOfferCard[] }
  | { kind: 'empty_following' }
  | { kind: 'empty_discover' };

export function buildHomeRows(model: VaultHomeModel, scope: VaultHomeScope): HomeRow[] {
  const rows: HomeRow[] = [{ kind: 'masthead' }, { kind: 'scope' }];

  if (model.isEmpty) {
    rows.push(scope === 'following' ? { kind: 'empty_following' } : { kind: 'empty_discover' });
    return rows;
  }

  if (scope === 'following') {
    if (model.yourCreators.length > 0) {
      rows.push({ kind: 'chapter', title: 'Your worlds' });
      rows.push({ kind: 'rail', items: model.yourCreators });
    }
    if (model.todaysDrops.length > 0) {
      rows.push({ kind: 'chapter', title: 'Tonight' });
      const [first, ...rest] = model.todaysDrops;
      if (first) rows.push({ kind: 'today', drop: first });
      if (rest.length > 0) rows.push({ kind: 'dropStrip', drops: rest.slice(0, 8) });
    }
    if (model.continueItems.length > 0) {
      rows.push({ kind: 'chapter', title: 'Continue' });
      rows.push({ kind: 'dropStrip', drops: model.continueItems.slice(0, 6) });
    }
    return rows;
  }

  if (model.discoverWorlds.length > 0) {
    const [featured, ...rest] = model.discoverWorlds;
    if (featured) rows.push({ kind: 'featured', creator: featured });
    if (rest.length > 0) {
      rows.push({ kind: 'collage', worlds: rest });
    }
  }

  if (model.todaysDrops.length > 0) {
    rows.push({ kind: 'chapter', title: 'New drops' });
    const [first, ...rest] = model.todaysDrops;
    if (first) rows.push({ kind: 'today', drop: first });
    if (rest.length > 0) rows.push({ kind: 'dropStrip', drops: rest.slice(0, 8) });
  }

  if (model.discoverCourses.length > 0) {
    rows.push({ kind: 'chapter', title: 'Learn' });
    rows.push({ kind: 'courses', offers: model.discoverCourses.slice(0, 4) });
  }
  if (model.discoverServices.length > 0) {
    rows.push({ kind: 'chapter', title: 'Work with a creator' });
    rows.push({ kind: 'services', offers: model.discoverServices.slice(0, 4) });
  }
  if (model.discoverProducts.length > 0) {
    rows.push({ kind: 'chapter', title: 'From the shelf' });
    rows.push({ kind: 'products', offers: model.discoverProducts.slice(0, 6) });
  }

  return rows;
}
