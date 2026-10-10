import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fromMapLibreCoordinate,
  toMapLibreCoordinate,
  viewportRequiresSearch,
  type WorldCameraRegion,
  type WorldMapInteraction,
} from './worldMapAdapter.ts';

const goa: WorldCameraRegion = {
  latitude: 15.27, longitude: 73.83, latitudeDelta: 0.2, longitudeDelta: 0.2,
};

describe('World map provider boundary', () => {
  it('converts to MapLibre longitude-first coordinates without swapping', () => {
    assert.deepEqual(toMapLibreCoordinate({ latitude: 15.27, longitude: 73.83 }), [73.83, 15.27]);
    assert.deepEqual(fromMapLibreCoordinate([73.83, 15.27]), { latitude: 15.27, longitude: 73.83 });
  });

  it('round-trips negative latitude/longitude and zeros', () => {
    for (const point of [{ latitude: -33.86, longitude: 151.21 }, { latitude: 0, longitude: 0 }, { latitude: 15.27, longitude: -73.83 }]) {
      assert.deepEqual(fromMapLibreCoordinate(toMapLibreCoordinate(point)), point);
    }
  });

  it('does not offer Search this area for an unchanged region', () => {
    assert.equal(viewportRequiresSearch(goa, { ...goa }), false);
  });

  it('keeps Search this area for significant movement during an outstanding request', () => {
    assert.equal(viewportRequiresSearch(goa, { ...goa, longitude: 73.93 }), true);
  });

  it('does not show Search this area for tiny camera jitter', () => {
    assert.equal(viewportRequiresSearch(goa, { ...goa, longitude: 73.831 }), false);
  });

  it('recognizes a substantial zoom change', () => {
    assert.equal(viewportRequiresSearch(goa, { ...goa, latitudeDelta: 0.4 }), true);
  });

  it('defines typed marker, cluster, map and camera events without a native provider', () => {
    const events: WorldMapInteraction[] = [
      { kind: 'camera-idle', region: goa },
      { kind: 'drop-selected', dropId: 'drop-1' },
      { kind: 'cluster-selected', latitude: 15.27, longitude: 73.83, count: 3 },
      { kind: 'map-tapped' },
    ];
    assert.deepEqual(events.map((event) => event.kind), ['camera-idle', 'drop-selected', 'cluster-selected', 'map-tapped']);
  });
});
