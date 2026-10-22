/**
 * Explore E2.8 D5 — closing the country picker must drop the previous search
 * (and therefore its filtered results). Reopening always starts from the full
 * catalogue.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EXPLORE_COUNTRIES } from '../data/exploreCountries.ts';
import {
  PICKER_MAX_ACTIVE,
  PICKER_MAX_RESULTS,
  pickerQueryAfterVisibility,
  pickerSections,
  pickerSearching,
} from './explorePickerModel.ts';
import type { WorldCountryActivity } from './exploreWorldModel.ts';

const activity = (code: string, activityCount: number | null): WorldCountryActivity => ({
  code,
  name: EXPLORE_COUNTRIES.find((country) => country.code === code)?.name ?? code,
  activityCount,
  hasChallenge: false,
  hasTreasure: false,
});

describe('E2.8 D5 — a closed picker forgets the search', () => {
  it('clears the query on close and keeps it while open', () => {
    assert.equal(pickerQueryAfterVisibility('jap', false), '');
    assert.equal(pickerQueryAfterVisibility('  japan  ', false), '');
    assert.equal(pickerQueryAfterVisibility('jap', true), 'jap');
    assert.equal(pickerQueryAfterVisibility('', true), '');
  });

  it('reopening restores the full catalogue, not the filtered slice', () => {
    const filtered = pickerSections({ query: 'jap' });
    assert.equal(filtered.searching, true);
    assert.deepEqual(
      filtered.results.map((country) => country.code),
      ['JP'],
    );

    const reopened = pickerSections({ query: pickerQueryAfterVisibility('jap', false) });
    const fresh = pickerSections({ query: '' });
    assert.deepStrictEqual(reopened, fresh);
    assert.equal(reopened.searching, false);
    assert.equal(
      reopened.results.length,
      Math.min(EXPLORE_COUNTRIES.length, PICKER_MAX_RESULTS),
      'every curated country stays browsable',
    );
    assert.ok(
      reopened.results.some((country) => country.code === 'JP'),
      'Japan must be back in the unfiltered list',
    );
  });

  it('treats whitespace as no search at all', () => {
    assert.equal(pickerSearching('   '), false);
    assert.equal(pickerSearching(' jp '), true);
    assert.deepStrictEqual(
      pickerSections({ query: '   ' }),
      pickerSections({ query: '' }),
    );
  });
});

describe('E2.8 — picker sections stay intact', () => {
  it('matches by name fragment and by exact code, case-insensitively', () => {
    assert.deepEqual(
      pickerSections({ query: 'GER' }).results.map((country) => country.code),
      ['DE', 'NG'],
    );
    assert.deepEqual(
      pickerSections({ query: 'jp' }).results.map((country) => country.code),
      ['JP'],
    );
  });

  it('hides engaged countries from "All countries" until the user searches', () => {
    const active = [activity('IN', 12)];
    const browse = pickerSections({ query: '', active });
    assert.ok(!browse.results.some((country) => country.code === 'IN'));
    assert.equal(browse.activeList.length, 1);

    const typed = pickerSections({ query: 'i', active });
    assert.equal(typed.results[0].code, 'IN', 'engaged country leads its own search');
  });

  it('caps "Happening now" without dropping other activity', () => {
    const active = [
      activity('IN', 12),
      activity('JP', 10),
      activity('US', 9),
      activity('BR', 8),
      activity('DE', 7),
      activity('FR', 6),
      activity('NG', 5),
      activity('MX', 4),
    ];
    const sections = pickerSections({ query: '', active });
    assert.equal(sections.activeList.length, PICKER_MAX_ACTIVE);
    assert.deepEqual(
      sections.activeList.map((country) => country.code),
      ['IN', 'JP', 'US', 'BR', 'DE', 'FR'],
    );
    assert.ok(
      sections.results.some((country) => country.code === 'MX'),
      'the 7th engaged country stays browsable in "All countries"',
    );
    assert.ok(
      !sections.results.some((country) => country.code === 'FR'),
      'countries already shown in "Happening now" are not duplicated',
    );
  });

  it('keeps the whole catalogue browsable, including the last entry', () => {
    const all = pickerSections({ query: '' });
    assert.equal(all.results.length, EXPLORE_COUNTRIES.length);
    const last = EXPLORE_COUNTRIES[EXPLORE_COUNTRIES.length - 1];
    assert.ok(
      all.results.some((country) => country.code === last.code),
      `${last.name} must not be dropped by the result cap`,
    );
  });

  it('maps recents to the catalogue and drops unknown codes', () => {
    const sections = pickerSections({ query: '', recentCodes: ['JP', 'ZZ', 'IN'] });
    assert.deepEqual(
      sections.recent.map((country) => country.code),
      ['JP', 'IN'],
    );
  });
});
