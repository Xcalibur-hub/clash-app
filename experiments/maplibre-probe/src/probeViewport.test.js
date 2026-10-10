import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateProbeDataset } from './probeDatasets.js';
import { expandRegion, filterDropsInViewport, pointInRegion } from './probeViewport.js';
import { regionFromZoom } from './probeCoordinates.js';

describe('probe viewport filtering', () => {
  it('detects points inside a region', () => {
    const region = regionFromZoom(15.49, 73.83, 12);
    assert.equal(pointInRegion(region, 15.49, 73.83), true);
    assert.equal(pointInRegion(region, 20, 80), false);
  });

  it('filters a large dataset down to the camera viewport', () => {
    const drops = generateProbeDataset(1000, 1);
    const region = regionFromZoom(15.49, 73.83, 13);
    const visible = filterDropsInViewport(drops, region, 0.1);
    assert.ok(visible.length < drops.length);
    assert.ok(visible.length > 0);
    for (const drop of visible) {
      assert.equal(pointInRegion(expandRegion(region, 0.1), drop.approxLat, drop.approxLng), true);
    }
  });

  it('returns empty for an empty dataset', () => {
    const region = regionFromZoom(15.49, 73.83, 11);
    assert.deepEqual(filterDropsInViewport([], region), []);
  });
});
