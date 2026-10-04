import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CREATOR_MODULE_REGISTRY,
  isCreatorModuleSupported,
  resolveCreatorWorldModules,
} from './vaultModules.ts';

describe('Creator World modules', () => {
  it('orders supported modules with data and hides empty ones', () => {
    const mods = resolveCreatorWorldModules({
      contentCount: 3,
      collectionCount: 1,
    });
    assert.deepEqual(
      mods.map((m) => m.type),
      ['CONTENT', 'COLLECTIONS'],
    );
  });

  it('hides empty supported modules', () => {
    const mods = resolveCreatorWorldModules({
      contentCount: 0,
      collectionCount: 2,
    });
    assert.deepEqual(
      mods.map((m) => m.type),
      ['COLLECTIONS'],
    );
  });

  it('never exposes planned modules even with fake signals', () => {
    const mods = resolveCreatorWorldModules({
      contentCount: 1,
      collectionCount: 0,
      serviceCount: 9,
      courseCount: 4,
      storeCount: 2,
      communityReady: true,
      aiReady: true,
      liveReady: true,
      worldDropCount: 5,
      experienceCount: 3,
    });
    assert.deepEqual(
      mods.map((m) => m.type),
      ['CONTENT'],
    );
    assert.equal(mods.some((m) => m.type === 'SERVICES'), false);
    assert.equal(mods.some((m) => m.type === 'AI'), false);
  });

  it('marks only CONTENT and COLLECTIONS supported in 15.0', () => {
    assert.equal(isCreatorModuleSupported('CONTENT'), true);
    assert.equal(isCreatorModuleSupported('COLLECTIONS'), true);
    assert.equal(isCreatorModuleSupported('STORE'), false);
    assert.ok(CREATOR_MODULE_REGISTRY.some((m) => m.type === 'WORLD_DROPS'));
  });
});
