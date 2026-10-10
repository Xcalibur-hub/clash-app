import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clusterExpansionZoom,
  clusterProbeDrops,
  regionMovedSignificantly,
} from './probeCluster.js';
import { SYNTHETIC_DROPS } from './probeDrops.js';
import { regionFromZoom } from './probeCoordinates.js';

describe('probe clustering', () => {
  it('returns an empty list for an empty Drop dataset', () => {
    const region = regionFromZoom(15.49, 73.83, 11);
    assert.deepEqual(clusterProbeDrops([], region), []);
  });

  it('groups nearby Panaji Drops into a numbered cluster when zoomed out', () => {
    const region = regionFromZoom(15.49, 73.83, 10);
    const items = clusterProbeDrops(SYNTHETIC_DROPS, region);
    const clusters = items.filter((item) => item.kind === 'cluster');
    const drops = items.filter((item) => item.kind === 'drop');

    assert.ok(clusters.length >= 1, 'expected at least one cluster');
    const panaji = clusters.find((cluster) =>
      cluster.drops.some((drop) => drop.id.startsWith('drop-panaji')),
    );
    assert.ok(panaji, 'expected a Panaji cluster');
    assert.equal(panaji.count, panaji.drops.length);
    assert.ok(panaji.count >= 2);

    const ids = new Set(items.map((item) => item.id));
    assert.equal(ids.size, items.length, 'marker ids must be unique');

    const covered = clusters.reduce((n, c) => n + c.count, 0) + drops.length;
    assert.equal(covered, SYNTHETIC_DROPS.length);
  });

  it('expands to individual Drops when latitudeDelta is tight', () => {
    const region = {
      latitude: 15.49,
      longitude: 73.83,
      latitudeDelta: 0.03,
      longitudeDelta: 0.03,
    };
    const items = clusterProbeDrops(SYNTHETIC_DROPS, region);
    assert.equal(items.every((item) => item.kind === 'drop'), true);
    assert.equal(items.length, SYNTHETIC_DROPS.length);
  });

  it('computes cluster expansion zoom without overshooting the cap', () => {
    assert.equal(clusterExpansionZoom(10), 12);
    assert.equal(clusterExpansionZoom(15), 16);
    assert.equal(clusterExpansionZoom(16), 16);
  });

  it('detects significant camera movement thresholds', () => {
    const a = regionFromZoom(15.49, 73.83, 11);
    const nearby = { ...a, latitude: a.latitude + a.latitudeDelta * 0.1 };
    const far = { ...a, latitude: a.latitude + a.latitudeDelta * 0.8 };
    assert.equal(regionMovedSignificantly(a, nearby), false);
    assert.equal(regionMovedSignificantly(a, far), true);
  });
});
