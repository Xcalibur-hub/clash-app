import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  communityIdentityPresentation,
  communitySeed,
  deriveCommunityAlias,
} from './vaultCommunityPseudonym.ts';

describe('community pseudonyms', () => {
  it('is deterministic for the same community + profile', () => {
    const a = deriveCommunityAlias('cmt_maya', 'profile-kevin');
    const b = deriveCommunityAlias('cmt_maya', 'profile-kevin');
    assert.equal(a, b);
    assert.equal(communitySeed('cmt_maya', 'profile-kevin'), communitySeed('cmt_maya', 'profile-kevin'));
  });

  it('produces a stable, readable alias shape', () => {
    const alias = deriveCommunityAlias('cmt_maya', 'profile-kevin');
    assert.match(alias, /^[A-Z][a-z]+ [A-Z][a-z]+ \d{2}$/);
  });

  it('scopes the alias to the community and never leaks the profile id', () => {
    const inMaya = deriveCommunityAlias('cmt_maya', 'profile-kevin');
    const inLeo = deriveCommunityAlias('cmt_leo', 'profile-kevin');
    assert.notEqual(inMaya, inLeo);
    assert.equal(inMaya.includes('profile-kevin'), false);
  });

  it('derives the same alias for the same pair regardless of order of calls', () => {
    const first = deriveCommunityAlias('cmt_x', 'p1');
    deriveCommunityAlias('cmt_y', 'p2');
    assert.equal(deriveCommunityAlias('cmt_x', 'p1'), first);
  });
});

describe('community identity presentation', () => {
  it('hides handle, profile id and profile link for a pseudonymous author', () => {
    const view = communityIdentityPresentation({
      name: 'Night Owl 27',
      handle: 'kevin',
      profileId: 'profile-kevin',
      tint: '#2F6FED',
      pseudonymous: true,
    });
    assert.equal(view.label, 'Night Owl 27');
    assert.equal(view.handle, null);
    assert.equal(view.canOpenProfile, false);
    assert.equal(view.pseudonymous, true);
    assert.equal(view.initials, 'NO');
  });

  it('exposes handle and profile link for a real identity', () => {
    const view = communityIdentityPresentation({
      name: 'Kevin',
      handle: 'kevin',
      profileId: 'profile-kevin',
      tint: '#2F6FED',
      pseudonymous: false,
    });
    assert.equal(view.handle, 'kevin');
    assert.equal(view.canOpenProfile, true);
    assert.equal(view.pseudonymous, false);
  });
});
