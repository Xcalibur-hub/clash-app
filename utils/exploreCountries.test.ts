import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countryByCode, searchCountries } from '../data/exploreCountries.ts';

describe('exploreCountries', () => {
  it('resolves ISO codes', () => {
    assert.equal(countryByCode('in')?.name, 'India');
    assert.equal(countryByCode(null), null);
  });

  it('searches by name and code', () => {
    assert.ok(searchCountries('japan').some((c) => c.code === 'JP'));
    assert.ok(searchCountries('BR').some((c) => c.code === 'BR'));
  });
});
