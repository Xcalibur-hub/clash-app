import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isCreatorModuleSupported,
  resolveCreatorWorldModules,
} from './vaultModules.ts';

describe('Creator World modules', () => {
  it('orders supported modules with data and hides empty ones', () => {
    const mods = resolveCreatorWorldModules({
      contentCount: 3,
      collectionCount: 1,
      serviceCount: 2,
      courseCount: 1,
      storeCount: 1,
    });
    assert.deepEqual(
      mods.map((m) => m.type),
      ['CONTENT', 'COLLECTIONS', 'SERVICES', 'COURSES', 'STORE'],
    );
  });

  it('hides empty supported commerce modules', () => {
    const mods = resolveCreatorWorldModules({
      contentCount: 0,
      collectionCount: 0,
      serviceCount: 0,
      courseCount: 2,
      storeCount: 0,
    });
    assert.deepEqual(
      mods.map((m) => m.type),
      ['COURSES'],
    );
  });

  it('never exposes planned modules even with fake signals', () => {
    const mods = resolveCreatorWorldModules({
      contentCount: 1,
      collectionCount: 0,
      serviceCount: 0,
      courseCount: 0,
      storeCount: 0,
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
    assert.equal(mods.some((m) => m.type === 'AI'), false);
  });

  it('marks SERVICES COURSES STORE supported in 15.1', () => {
    assert.equal(isCreatorModuleSupported('CONTENT'), true);
    assert.equal(isCreatorModuleSupported('SERVICES'), true);
    assert.equal(isCreatorModuleSupported('COURSES'), true);
    assert.equal(isCreatorModuleSupported('STORE'), true);
    assert.equal(isCreatorModuleSupported('AI'), false);
  });
});
