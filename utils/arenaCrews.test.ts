import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ARENA_CREW_SPECIALTIES } from '../services/arenaCrewService.ts';

describe('arena crew specialties', () => {
  it('ships the product specialty list', () => {
    assert.ok(ARENA_CREW_SPECIALTIES.includes('Tech'));
    assert.ok(ARENA_CREW_SPECIALTIES.includes('General'));
    assert.equal(ARENA_CREW_SPECIALTIES.length, 13);
  });
});
