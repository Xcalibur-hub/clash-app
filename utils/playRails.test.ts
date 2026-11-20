import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  partitionPlayChallenges,
  partitionPlayTreasures,
  type PlayChallengeRailItem,
  type PlayTreasureRailItem,
} from './playRails.ts';

const now = Date.parse('2026-10-04T12:00:00.000Z');

function challenge(
  partial: Partial<PlayChallengeRailItem> & { id: string },
): PlayChallengeRailItem {
  return {
    status: 'active',
    endsAt: now + 3_600_000,
    challengeType: 'GLOBAL',
    joined: false,
    ...partial,
  };
}

function treasure(
  partial: Partial<PlayTreasureRailItem> & { id: string },
): PlayTreasureRailItem {
  return {
    status: 'active',
    endsAt: now + 3_600_000,
    huntType: 'GLOBAL',
    progress: 0,
    completed: false,
    giftsRemaining: 5,
    ...partial,
  };
}

describe('partitionPlayChallenges', () => {
  it('buckets featured, ending soon, scopes, and joined', () => {
    const items = [
      challenge({ id: 'a', endsAt: now + 1_000_000, challengeType: 'GLOBAL' }),
      challenge({ id: 'b', endsAt: now + 500_000, challengeType: 'COUNTRY' }),
      challenge({ id: 'c', endsAt: now + 2_000_000, challengeType: 'CREATOR', joined: true }),
      challenge({ id: 'd', status: 'ended', endsAt: now - 1_000 }),
    ];
    const rails = partitionPlayChallenges(items, now);
    assert.equal(rails.featured.length, 3);
    assert.deepEqual(
      rails.endingSoon.map((c) => c.id),
      ['b', 'a', 'c'],
    );
    assert.equal(rails.global.length, 1);
    assert.equal(rails.country.length, 1);
    assert.equal(rails.creator.length, 1);
    assert.equal(rails.joined.length, 1);
  });
});

describe('partitionPlayTreasures', () => {
  it('tracks in-progress and unlimited gifts cards', () => {
    const items = [
      treasure({ id: 't1', progress: 2, giftsRemaining: null }),
      treasure({ id: 't2', completed: true, progress: 4 }),
      treasure({ id: 't3', huntType: 'COUNTRY' }),
    ];
    const rails = partitionPlayTreasures(items, now);
    assert.equal(rails.inProgress.length, 2);
    assert.equal(rails.country.length, 1);
    assert.equal(rails.featured[0]?.giftsRemaining, null);
  });
});
