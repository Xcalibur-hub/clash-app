import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ARENA_CREW_SPECIALTIES } from './arenaCrewSpecialties.ts';
import {
  arenaCrewErrorKey,
  parseArenaCrewList,
  parseArenaCrewPayload,
} from './arenaCrewPayload.ts';

describe('arena crew specialties', () => {
  it('ships the product specialty list', () => {
    assert.ok(ARENA_CREW_SPECIALTIES.includes('Tech'));
    assert.ok(ARENA_CREW_SPECIALTIES.includes('General'));
    assert.equal(ARENA_CREW_SPECIALTIES.length, 13);
  });
});

describe('arena crew payload parsing', () => {
  const sample = {
    id: 'ac_1',
    slug: 'open-alpha',
    name: 'Open Alpha',
    bio: 'hello',
    avatarUrl: null,
    bannerUrl: null,
    specialties: ['Tech'],
    joinMode: 'OPEN',
    memberCount: 2,
    followerCount: 1,
    totalReputation: 0,
    seasonalRating: 1000,
    wins: 0,
    losses: 0,
    streak: 0,
    createdAt: '2026-10-06T00:00:00Z',
    viewer: { isMember: true, role: 'OWNER', isFollowing: false },
  };

  it('parses a full arena_crew_payload shape', () => {
    const crew = parseArenaCrewPayload(sample);
    assert.ok(crew);
    assert.equal(crew.id, 'ac_1');
    assert.equal(crew.joinMode, 'OPEN');
    assert.equal(crew.memberCount, 2);
    assert.equal(crew.viewer.role, 'OWNER');
    assert.equal(crew.viewer.isMember, true);
  });

  it('rejects malformed payloads', () => {
    assert.equal(parseArenaCrewPayload(null), null);
    assert.equal(parseArenaCrewPayload({ slug: 'x' }), null);
  });

  it('parses list payloads and drops invalid rows', () => {
    const list = parseArenaCrewList([sample, { nope: true }, null]);
    assert.equal(list.length, 1);
    assert.equal(list[0].slug, 'open-alpha');
  });
});

describe('arena crew error keys', () => {
  it('maps known RPC messages', () => {
    assert.equal(arenaCrewErrorKey('already in a crew'), 'already_in_crew');
    assert.equal(arenaCrewErrorKey('crew rejoin cooldown active'), 'cooldown');
    assert.equal(arenaCrewErrorKey('crew slug is taken'), 'slug_taken');
    assert.equal(arenaCrewErrorKey('invite expired'), 'invite_expired');
    assert.equal(arenaCrewErrorKey('EXPIRED'), 'invite_expired');
    assert.equal(
      arenaCrewErrorKey('only owners and moderators can invite'),
      'permission_denied',
    );
    assert.equal(arenaCrewErrorKey('request already pending'), 'request_already_pending');
  });
});
