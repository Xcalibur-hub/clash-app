import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildHomeRows } from './vaultHomeRows.ts';
import type { VaultHomeModel } from '../services/vaultHomeService.ts';

function world(id: string): never {
  return {
    creatorId: id,
    handle: id,
    name: id,
    tint: '#000',
    bio: null,
    vaultId: `v-${id}`,
    latestCaption: null,
    latestAccess: null,
    mediaUrl: null,
  } as never;
}

function offer(id: string, kind: 'service' | 'course' | 'product'): never {
  return {
    id,
    kind,
    creatorId: 'c1',
    title: id,
    subtitle: null,
    coverUrl: null,
    accessType: 'free',
    priceAmountMinor: null,
    currency: null,
    externalUrl: null,
    authorHandle: 'c',
    authorName: 'Creator',
  } as never;
}

function drop(id: string): never {
  return {
    id,
    dropId: id,
    vaultId: 'v1',
    creatorId: 'c1',
    caption: id,
    accessLevel: 'free',
    mediaUrl: null,
    mediaKind: 'image',
    authorHandle: 'c',
    authorName: 'Creator',
    authorTint: '#000',
    score: 1,
  } as never;
}

function model(partial: Partial<VaultHomeModel>): VaultHomeModel {
  return {
    scope: 'discover',
    todaysDrops: [],
    yourCreators: [],
    continueItems: [],
    discoverWorlds: [],
    discoverServices: [],
    discoverCourses: [],
    discoverProducts: [],
    canCreate: false,
    isEmpty: false,
    followingEmpty: false,
    ...partial,
  };
}

describe('vault home rows', () => {
  it('opens with masthead + scope then a featured world and a collage', () => {
    const rows = buildHomeRows(
      model({ discoverWorlds: [world('maya'), world('leo'), world('aria')] as never }),
      'discover',
    );
    assert.deepEqual(
      rows.slice(0, 4).map((row) => row.kind),
      ['masthead', 'scope', 'featured', 'collage'],
    );
  });

  it('shows the discover empty state when there is nothing at all', () => {
    const rows = buildHomeRows(model({ isEmpty: true }), 'discover');
    assert.equal(rows[rows.length - 1]?.kind, 'empty_discover');
  });

  it('shows the following empty state in the following scope', () => {
    const rows = buildHomeRows(model({ isEmpty: true }), 'following');
    assert.equal(rows[rows.length - 1]?.kind, 'empty_following');
  });

  it('groups today\'s drops into a lead plus a strip', () => {
    const rows = buildHomeRows(
      model({ todaysDrops: [drop('a'), drop('b'), drop('c')] as never }),
      'discover',
    );
    const kinds = rows.map((row) => row.kind);
    assert.ok(kinds.includes('today'));
    assert.ok(kinds.includes('dropStrip'));
  });

  it('groups commerce offers into single chapters', () => {
    const rows = buildHomeRows(
      model({
        discoverCourses: [offer('c1', 'course')] as never,
        discoverServices: [offer('s1', 'service')] as never,
        discoverProducts: [offer('p1', 'product')] as never,
      }),
      'discover',
    );
    const kinds = rows.map((row) => row.kind);
    assert.ok(kinds.includes('courses'));
    assert.ok(kinds.includes('services'));
    assert.ok(kinds.includes('products'));
  });

  it('keeps the following rail for followed creators', () => {
    const rows = buildHomeRows(
      model({ yourCreators: [world('maya')] as never }),
      'following',
    );
    assert.ok(rows.some((row) => row.kind === 'rail'));
  });
});
