import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ARENA_CREW_SPECIALTIES } from './arenaCrewSpecialties.ts';
import {
  crewCrestInitials,
  crewJoinAction,
  crewJoinLabel,
  formatCrewMembers,
  suggestCrewSlug,
} from './arenaCrewIdentity.ts';
import {
  arenaCrewErrorKey,
  parseArenaCrewDiscoverPage,
  parseArenaCrewList,
  parseArenaCrewMembers,
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
    viewer: {
      isMember: true,
      role: 'OWNER',
      isFollowing: false,
      hasPendingRequest: false,
      activeCrewId: 'ac_1',
    },
  };

  it('parses a full arena_crew_payload shape', () => {
    const crew = parseArenaCrewPayload(sample);
    assert.ok(crew);
    assert.equal(crew.id, 'ac_1');
    assert.equal(crew.joinMode, 'OPEN');
    assert.equal(crew.memberCount, 2);
    assert.equal(crew.viewer.role, 'OWNER');
    assert.equal(crew.viewer.isMember, true);
    assert.equal(crew.viewer.hasPendingRequest, false);
    assert.equal(crew.viewer.activeCrewId, 'ac_1');
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

  it('parses discovery pages with keyset cursor', () => {
    const page = parseArenaCrewDiscoverPage({
      items: [sample],
      nextCursor: '2|ac_1',
      sort: 'popular',
    });
    assert.equal(page.items.length, 1);
    assert.equal(page.nextCursor, '2|ac_1');
    assert.equal(page.sort, 'popular');
  });

  it('parses compact member rows', () => {
    const members = parseArenaCrewMembers([
      {
        profileId: 'p1',
        name: 'Ada',
        handle: 'ada',
        tint: '#FF6A3D',
        role: 'OWNER',
        joinedAt: '2026-10-06T00:00:00Z',
      },
      { profileId: 'bad' },
    ]);
    assert.equal(members.length, 1);
    assert.equal(members[0].role, 'OWNER');
    assert.equal(members[0].handle, 'ada');
  });
});

describe('arena crew join UI state', () => {
  const base = {
    isMember: false,
    hasPendingRequest: false,
    activeCrewId: null as string | null,
  };

  it('maps OPEN join', () => {
    assert.equal(crewJoinAction('OPEN', base, 'ac_1'), 'join');
    assert.equal(crewJoinLabel('OPEN', base, 'ac_1'), 'JOIN CREW');
  });

  it('maps REQUEST and pending', () => {
    assert.equal(crewJoinAction('REQUEST', base, 'ac_1'), 'request');
    assert.equal(
      crewJoinAction('REQUEST', { ...base, hasPendingRequest: true }, 'ac_1'),
      'pending',
    );
  });

  it('blocks when already in another crew', () => {
    assert.equal(
      crewJoinAction('OPEN', { ...base, activeCrewId: 'ac_other' }, 'ac_1'),
      'blocked_other',
    );
    assert.equal(
      crewJoinLabel('OPEN', { ...base, activeCrewId: 'ac_other' }, 'ac_1'),
      'ONE CREW ONLY',
    );
  });

  it('maps invite-only and member', () => {
    assert.equal(crewJoinAction('INVITE_ONLY', base, 'ac_1'), 'invite_only');
    assert.equal(
      crewJoinAction('OPEN', { ...base, isMember: true, activeCrewId: 'ac_1' }, 'ac_1'),
      'member',
    );
  });
});

describe('arena crew identity', () => {
  it('builds deterministic crest initials', () => {
    assert.equal(crewCrestInitials('Byte Club'), 'BC');
    assert.equal(crewCrestInitials('Droid'), 'D');
  });

  it('suggests slugs from names', () => {
    assert.equal(suggestCrewSlug('Byte Club'), 'byte-club');
    assert.equal(suggestCrewSlug('  Tech!! Crew  '), 'tech-crew');
  });

  it('formats member counts socially', () => {
    assert.equal(formatCrewMembers(1), '1 member');
    assert.equal(formatCrewMembers(12), '12 members');
    assert.equal(formatCrewMembers(1800), '1.8K members');
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
