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

  it('never exposes still-planned modules even with fake signals', () => {
    const mods = resolveCreatorWorldModules({
      contentCount: 1,
      collectionCount: 0,
      serviceCount: 0,
      courseCount: 0,
      storeCount: 0,
      experienceCount: 3,
    });
    assert.deepEqual(
      mods.map((m) => m.type),
      ['CONTENT'],
    );
    assert.equal(mods.some((m) => m.type === 'EXPERIENCES'), false);
  });

  it('surfaces CREATOR AI once a creator enables it (Phase 15.5)', () => {
    const mods = resolveCreatorWorldModules({
      contentCount: 0,
      collectionCount: 0,
      aiReady: true,
    });
    assert.deepEqual(
      mods.map((m) => m.type),
      ['AI'],
    );
  });

  it('surfaces COMMUNITY once populated (Phase 15.2)', () => {
    const mods = resolveCreatorWorldModules({
      contentCount: 0,
      collectionCount: 0,
      communityReady: true,
    });
    assert.deepEqual(
      mods.map((m) => m.type),
      ['COMMUNITY'],
    );
  });

  it('surfaces WORLD_DROPS once a creator hides something (Phase 15.3)', () => {
    const mods = resolveCreatorWorldModules({
      contentCount: 0,
      collectionCount: 0,
      worldDropCount: 2,
    });
    assert.deepEqual(
      mods.map((m) => m.type),
      ['WORLD_DROPS'],
    );
  });

  it('surfaces LIVE once a creator goes live or schedules one (Phase 15.4)', () => {
    const mods = resolveCreatorWorldModules({
      contentCount: 0,
      collectionCount: 0,
      liveReady: true,
    });
    assert.deepEqual(
      mods.map((m) => m.type),
      ['LIVE'],
    );
  });

  it('marks SERVICES COURSES STORE COMMUNITY WORLD_DROPS LIVE AI supported', () => {
    assert.equal(isCreatorModuleSupported('CONTENT'), true);
    assert.equal(isCreatorModuleSupported('SERVICES'), true);
    assert.equal(isCreatorModuleSupported('COURSES'), true);
    assert.equal(isCreatorModuleSupported('STORE'), true);
    assert.equal(isCreatorModuleSupported('COMMUNITY'), true);
    assert.equal(isCreatorModuleSupported('WORLD_DROPS'), true);
    assert.equal(isCreatorModuleSupported('LIVE'), true);
    assert.equal(isCreatorModuleSupported('AI'), true);
    assert.equal(isCreatorModuleSupported('EXPERIENCES'), false);
  });
});
