import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ExploreGeoCountry } from './exploreGeo.ts';
import {
  simplifyCountryForGlobe,
  worldCanvasActivePaths,
} from './exploreWorldPerf.ts';

describe('ExploreWorldCanvas mode exclusivity', () => {
  it('map mode keeps globe paths inactive', () => {
    const state = worldCanvasActivePaths('map', 177, 0);
    assert.equal(state.mapActive, true);
    assert.equal(state.globeActive, false);
    assert.equal(state.paths, 177);
  });

  it('globe mode keeps map paths inactive', () => {
    const state = worldCanvasActivePaths('globe', 0, 120);
    assert.equal(state.mapActive, false);
    assert.equal(state.globeActive, true);
    assert.equal(state.paths, 120);
  });
});

describe('simplifyCountryForGlobe', () => {
  it('reduces ring points with stride while keeping endpoints', () => {
    const country: ExploreGeoCountry = {
      code: 'ZZ',
      name: 'Test',
      lat: 0,
      lng: 0,
      polygons: [[Array.from({ length: 20 }, (_, i) => [i, i])]],
    };
    const simplified = simplifyCountryForGlobe(country, 2);
    const ring = simplified.polygons[0]![0]!;
    assert.ok(ring.length < 20);
    assert.ok(ring.length >= 10);
    assert.deepEqual(ring[0], [0, 0]);
    assert.deepEqual(ring[ring.length - 1], [19, 19]);
  });
});
