import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MEET_INTERESTS, MEET_MATCH_MODES } from './meetModes.ts';

describe('Meet matching modes', () => {
  it('supports the four product modes', () => {
    assert.deepEqual(MEET_MATCH_MODES, ['ANYWHERE', 'COUNTRY', 'INTERESTS', 'HOOD']);
  });

  it('exposes explicit interest vocabulary', () => {
    assert.ok(MEET_INTERESTS.includes('Music'));
    assert.ok(MEET_INTERESTS.includes('Movies'));
    assert.ok(MEET_INTERESTS.length >= 4);
  });
});
