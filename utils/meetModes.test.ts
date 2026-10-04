import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MEET_INTERESTS,
  MEET_MATCH_MODES,
  meetChannelsCompatible,
  meetIsOfferer,
} from './meetModes.ts';

describe('Meet matching modes', () => {
  it('supports the four product modes', () => {
    assert.deepEqual(MEET_MATCH_MODES, ['ANYWHERE', 'COUNTRY', 'INTERESTS', 'HOOD']);
  });

  it('exposes explicit interest vocabulary', () => {
    assert.ok(MEET_INTERESTS.includes('Music'));
    assert.ok(MEET_INTERESTS.includes('Movies'));
    assert.ok(MEET_INTERESTS.length >= 4);
  });

  it('selects offerer deterministically as seat A', () => {
    assert.equal(meetIsOfferer('A'), true);
    assert.equal(meetIsOfferer('B'), false);
    assert.equal(meetIsOfferer(null), false);
  });

  it('keeps TEXT and VIDEO channels separate', () => {
    assert.equal(meetChannelsCompatible('TEXT', 'TEXT'), true);
    assert.equal(meetChannelsCompatible('VIDEO', 'VIDEO'), true);
    assert.equal(meetChannelsCompatible('TEXT', 'VIDEO'), false);
  });
});
