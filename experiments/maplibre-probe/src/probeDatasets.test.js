import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DATASET_SIZES,
  clearProbeDatasetCache,
  createSeededRng,
  generateProbeDataset,
  getProbeDataset,
  isSupportedDatasetSize,
} from './probeDatasets.js';

describe('probe datasets', () => {
  it('exposes the Step 5 dataset sizes', () => {
    assert.deepEqual([...DATASET_SIZES], [50, 250, 1000, 5000]);
  });

  it('generates deterministic coordinates for a fixed seed', () => {
    const a = generateProbeDataset(50, 1);
    const b = generateProbeDataset(50, 1);
    assert.equal(a.length, 50);
    assert.deepEqual(a[0], b[0]);
    assert.deepEqual(a[49], b[49]);
    assert.notEqual(a[0].approxLat, a[1].approxLat);
  });

  it('keeps coordinates within the Goa synthetic bounds', () => {
    const drops = generateProbeDataset(250, 1);
    for (const drop of drops) {
      assert.ok(drop.approxLat > 15.2 && drop.approxLat < 15.8);
      assert.ok(drop.approxLng > 73.5 && drop.approxLng < 74.2);
      assert.ok(drop.id.startsWith('perf-250-'));
    }
  });

  it('handles empty and high-volume datasets', () => {
    assert.deepEqual(generateProbeDataset(0), []);
    const large = generateProbeDataset(5000, 1);
    assert.equal(large.length, 5000);
    const ids = new Set(large.map((drop) => drop.id));
    assert.equal(ids.size, 5000);
  });

  it('caches getProbeDataset and supports size checks', () => {
    clearProbeDatasetCache();
    assert.equal(isSupportedDatasetSize(1000), true);
    assert.equal(isSupportedDatasetSize(12), false);
    const first = getProbeDataset(50, 1);
    const second = getProbeDataset(50, 1);
    assert.equal(first, second);
  });

  it('seeded rng is stable', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    assert.equal(a(), b());
    assert.equal(a(), b());
  });
});
