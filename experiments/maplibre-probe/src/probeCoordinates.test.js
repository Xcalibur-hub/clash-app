import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  fromMapLibreLngLat,
  regionFromZoom,
  toMapLibreLngLat,
} from './probeCoordinates.js';

describe('probe coordinates', () => {
  it('converts to MapLibre longitude-first order without swapping', () => {
    assert.deepEqual(toMapLibreLngLat({ latitude: 15.5, longitude: 73.8 }), [73.8, 15.5]);
  });

  it('converts from MapLibre longitude-first order', () => {
    assert.deepEqual(fromMapLibreLngLat([73.8, 15.5]), {
      longitude: 73.8,
      latitude: 15.5,
    });
  });

  it('builds a region whose deltas shrink as zoom increases', () => {
    const wide = regionFromZoom(15.49, 73.83, 8);
    const tight = regionFromZoom(15.49, 73.83, 14);
    assert.ok(wide.latitudeDelta > tight.latitudeDelta);
    assert.ok(wide.longitudeDelta > tight.longitudeDelta);
    assert.equal(tight.latitude, 15.49);
    assert.equal(tight.longitude, 73.83);
  });
});
