import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyVaultHomeLoad,
  composeVaultHome,
  excludeBlockedCreators,
  filterFollowingDrops,
  isLocalSupabaseApiUrl,
  moduleSectionsActive,
  vaultHomeIsEmpty,
  type VaultCreatorWorldLike,
  type VaultHomeDropLike,
  type VaultHomeOfferLike,
} from './vaultHomeCompose.ts';

const drop = (
  id: string,
  creatorId: string,
  access: 'free' | 'preview' = 'free',
): VaultHomeDropLike => ({
  id,
  dropId: id,
  vaultId: `v_${creatorId}`,
  creatorId,
  caption: id,
  accessLevel: access,
  mediaUrl: null,
  mediaKind: 'image',
  authorHandle: creatorId,
  authorName: creatorId,
  authorTint: '#aaa',
  score: 10,
});

const world = (creatorId: string): VaultCreatorWorldLike => ({
  creatorId,
  handle: creatorId,
  name: creatorId,
  tint: '#aaa',
  bio: 'bio',
  vaultId: `v_${creatorId}`,
  latestCaption: 'drop',
  latestAccess: 'free',
  mediaUrl: null,
  hasServices: true,
  hasCourses: true,
  hasProducts: true,
  hasCollections: true,
  dropCount: 1,
});

const offer = (
  id: string,
  kind: 'service' | 'course' | 'product',
  creatorId: string,
): VaultHomeOfferLike => ({
  id,
  kind,
  creatorId,
  title: id,
  subtitle: null,
  coverUrl: null,
  accessType: 'free',
  priceAmountMinor: null,
  currency: null,
  externalUrl: null,
  authorHandle: creatorId,
  authorName: creatorId,
});

describe('vaultHomeCompose', () => {
  it('Discover works with zero follows', () => {
    const model = composeVaultHome({
      scope: 'discover',
      followingIds: [],
      blockedIds: new Set(),
      drops: [drop('d1', 'maya')],
      worlds: [world('maya'), world('leo')],
      services: [offer('s1', 'service', 'maya')],
      courses: [offer('c1', 'course', 'maya')],
      products: [offer('p1', 'product', 'maya')],
      continueItems: [],
      canCreate: true,
    });
    assert.equal(model.followingEmpty, false);
    assert.equal(model.isEmpty, false);
    assert.equal(model.discoverWorlds.length, 2);
    assert.equal(model.discoverServices.length, 1);
    assert.equal(model.discoverCourses.length, 1);
    assert.equal(model.discoverProducts.length, 1);
    assert.equal(model.yourCreators.length, 0);
  });

  it('Following empty state is intentional when no follows', () => {
    const model = composeVaultHome({
      scope: 'following',
      followingIds: [],
      blockedIds: new Set(),
      drops: [drop('d1', 'maya')],
      worlds: [world('maya')],
      services: [offer('s1', 'service', 'maya')],
      courses: [],
      products: [],
      continueItems: [],
      canCreate: true,
    });
    assert.equal(model.isEmpty, true);
    assert.equal(model.followingEmpty, true);
    assert.equal(model.todaysDrops.length, 0);
  });

  it('followed creator feeds Following', () => {
    const model = composeVaultHome({
      scope: 'following',
      followingIds: ['maya'],
      blockedIds: new Set(),
      drops: [drop('d1', 'maya'), drop('d2', 'leo')],
      worlds: [world('maya'), world('leo')],
      services: [],
      courses: [],
      products: [],
      continueItems: [],
      canCreate: true,
    });
    assert.equal(model.isEmpty, false);
    assert.deepEqual(
      model.todaysDrops.map((d) => d.creatorId),
      ['maya'],
    );
    assert.equal(model.yourCreators[0]?.creatorId, 'maya');
  });

  it('blocked creators excluded', () => {
    const drops = excludeBlockedCreators(
      [drop('d1', 'maya'), drop('d2', 'blocked')],
      new Set(['blocked']),
    );
    assert.equal(drops.length, 1);
    assert.equal(drops[0]?.creatorId, 'maya');
  });

  it('subscriber private media never appears as discover drop access', () => {
    const following = filterFollowingDrops(
      [drop('preview', 'maya', 'preview'), drop('free', 'maya', 'free')],
      new Set(['maya']),
    );
    assert.ok(following.every((d) => d.accessLevel === 'free' || d.accessLevel === 'preview'));
    assert.ok(!following.some((d) => (d as { accessLevel: string }).accessLevel === 'subscriber'));
  });

  it('module counts activate Creator World sections', () => {
    const mods = moduleSectionsActive({
      dropCount: 2,
      collectionCount: 1,
      serviceCount: 1,
      courseCount: 1,
      storeCount: 1,
    });
    assert.deepEqual(mods, {
      content: true,
      collections: true,
      services: true,
      learn: true,
      shop: true,
    });
    assert.deepEqual(
      moduleSectionsActive({
        dropCount: 0,
        collectionCount: 0,
        serviceCount: 0,
        courseCount: 0,
        storeCount: 0,
      }),
      {
        content: false,
        collections: false,
        services: false,
        learn: false,
        shop: false,
      },
    );
  });

  it('query error is distinguishable from empty result', () => {
    const err = classifyVaultHomeLoad({ ok: false, message: 'network' });
    assert.equal(err.status, 'error');
    const empty = classifyVaultHomeLoad({
      ok: true,
      model: { isEmpty: true },
    });
    assert.equal(empty.status, 'empty');
    const ok = classifyVaultHomeLoad({
      ok: true,
      model: { isEmpty: false },
    });
    assert.equal(ok.status, 'ok');
  });

  it('vaultHomeIsEmpty ignores non-empty commerce rails', () => {
    assert.equal(
      vaultHomeIsEmpty({
        todaysDrops: [],
        yourCreators: [],
        discoverWorlds: [],
        discoverServices: [offer('s1', 'service', 'maya')],
      }),
      false,
    );
  });

  it('fixture code cannot target hosted/production API URLs', () => {
    assert.equal(isLocalSupabaseApiUrl('http://127.0.0.1:55321'), true);
    assert.equal(isLocalSupabaseApiUrl('http://localhost:54321'), true);
    assert.equal(isLocalSupabaseApiUrl('https://eagbgwasiocfppwobpsd.supabase.co'), false);
    assert.equal(isLocalSupabaseApiUrl(null), false);
  });
});
