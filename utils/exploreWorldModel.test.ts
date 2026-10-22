import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  ExploreChallenge,
  ExploreCountrySummary,
  ExploreTreasure,
} from '../services/exploreService';
import {
  WORLD_ACTIVITY_FLOOR,
  orderCountriesByEngagement,
  surpriseCountry,
  worldActivityCountries,
  worldActivityLabel,
  worldContentCount,
  worldCountryContent,
} from './exploreWorldModel.ts';

function summaryCountry(
  countryCode: string,
  activityCount: number | null,
  extra: Partial<ExploreCountrySummary> = {},
): ExploreCountrySummary {
  return {
    countryCode,
    name: countryCode,
    activityCount,
    hasChallenge: false,
    hasTreasure: false,
    lat: 0,
    lng: 0,
    ...extra,
  };
}

const challenge = (id: string, countryCode: string | null): ExploreChallenge => ({
  id,
  title: `Challenge ${id}`,
  description: null,
  challengeType: countryCode ? 'COUNTRY' : 'GLOBAL',
  countryCode,
  status: 'active',
  entryCount: 4,
  endsAt: 0,
  coverUrl: null,
});

const treasure = (id: string, countryCode: string | null): ExploreTreasure => ({
  id,
  title: `Treasure ${id}`,
  description: null,
  countryCode,
  status: 'active',
  clue: 'Look closer',
  giftsRemaining: 3,
  endsAt: 0,
  rewardType: 'gift',
  coverUrl: null,
});

describe('exploreWorldModel', () => {
  it('keeps server activity order and trims to the rail limit', () => {
    const countries = [
      summaryCountry('JP', 42, { name: 'Japan', hasChallenge: true }),
      summaryCountry('BR', 12, { name: 'Brazil', hasTreasure: true }),
      summaryCountry('IN', 6, { name: 'India' }),
    ];
    const rail = worldActivityCountries(countries, 2);
    assert.deepEqual(
      rail.map((c) => c.code),
      ['JP', 'BR'],
    );
    assert.equal(rail[0]?.name, 'Japan');
    assert.equal(rail[0]?.activityCount, 42);
    assert.equal(rail[0]?.hasChallenge, true);
    assert.equal(rail[1]?.hasTreasure, true);
    assert.deepEqual(worldActivityCountries(null), []);
  });

  it('never states an activity number below the privacy floor', () => {
    assert.equal(worldActivityLabel(null), 'Quiet right now');
    assert.equal(worldActivityLabel(WORLD_ACTIVITY_FLOOR - 1), 'Quiet right now');
    assert.equal(worldActivityLabel(WORLD_ACTIVITY_FLOOR), '3 public profiles');
  });

  it('filters country content case-insensitively and drops global rows', () => {
    const content = worldCountryContent(
      [challenge('a', 'jp'), challenge('b', null), challenge('c', 'BR')],
      [treasure('t1', 'JP'), treasure('t2', null)],
      'jp',
    );
    assert.deepEqual(
      content.challenges.map((c) => c.id),
      ['a'],
    );
    assert.deepEqual(
      content.treasures.map((t) => t.id),
      ['t1'],
    );
    assert.equal(worldContentCount(content), 2);
    assert.equal(worldContentCount(worldCountryContent([], [], null)), 0);
  });

  it('moves active countries first without duplicating or reordering the rest', () => {
    const catalogue = [{ code: 'JP' }, { code: 'BR' }, { code: 'IN' }];
    const ordered = orderCountriesByEngagement(catalogue, ['IN', 'BR', 'ZZ', 'IN']);
    assert.deepEqual(
      ordered.map((c) => c.code),
      ['IN', 'BR', 'JP'],
    );
    assert.deepEqual(
      orderCountriesByEngagement(catalogue, []).map((c) => c.code),
      ['JP', 'BR', 'IN'],
    );
  });

describe('surpriseCountry (E2.9 automatic globe)', () => {
  const pool = [{ code: 'JP' }, { code: 'BR' }, { code: 'IN' }];

  it('never repeats the country that is already open', () => {
    for (const random of [0, 0.4, 0.999]) {
      const pick = surpriseCountry(pool, 'BR', () => random);
      assert.ok(pick);
      assert.notEqual(pick.code, 'BR');
    }
  });

  it('still returns the open country when it is the only one left', () => {
    const pick = surpriseCountry([{ code: 'BR' }], 'BR', () => 0.5);
    assert.equal(pick?.code, 'BR');
  });

  it('maps the random source onto the pool without ever leaving it', () => {
    assert.equal(surpriseCountry(pool, null, () => 0)?.code, 'JP');
    assert.equal(surpriseCountry(pool, null, () => 0.99)?.code, 'IN');
    // A hostile source cannot produce undefined.
    assert.equal(surpriseCountry(pool, null, () => 1)?.code, 'IN');
    assert.equal(surpriseCountry(pool, null, () => -3)?.code, 'JP');
  });

  it('returns null when the server reports no activity', () => {
    assert.equal(surpriseCountry([], 'JP'), null);
  });
});

});
