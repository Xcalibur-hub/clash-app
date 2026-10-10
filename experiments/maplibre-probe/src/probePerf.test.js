import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { regionFromZoom } from './probeCoordinates.js';
import { clearProbeDatasetCache } from './probeDatasets.js';
import {
  chooseRenderStrategy,
  itemsToGeoJson,
  prepareMapPipeline,
} from './probePerf.js';
import { selectProbeDrop } from './probeSelection.js';

describe('probe performance pipeline', () => {
  it('chooses marker views for small sets and geojson for large sets', () => {
    assert.equal(chooseRenderStrategy(50), 'markers');
    assert.equal(chooseRenderStrategy(250), 'markers');
    assert.equal(chooseRenderStrategy(1000), 'geojson-layers');
    assert.equal(chooseRenderStrategy(5000), 'geojson-layers');
  });

  it('prepares high-volume datasets with viewport filtering', () => {
    clearProbeDatasetCache();
    const region = regionFromZoom(15.49, 73.83, 12);
    const result = prepareMapPipeline({
      datasetSize: 5000,
      region,
      zoom: 12,
      clusterMode: 'hierarchical',
    });
    assert.equal(result.strategy, 'geojson-layers');
    assert.equal(result.metrics.datasetSize, 5000);
    assert.ok(result.metrics.visibleCount <= 5000);
    assert.ok(result.metrics.itemCount > 0);
    assert.ok(result.metrics.clusterMs < 500, `cluster too slow: ${result.metrics.clusterMs}`);
  });

  it('keeps cluster membership counts consistent', () => {
    const region = regionFromZoom(15.49, 73.83, 10);
    const result = prepareMapPipeline({
      datasetSize: 250,
      region,
      zoom: 10,
      clusterMode: 'grid',
    });
    const covered =
      result.items
        .filter((item) => item.kind === 'cluster')
        .reduce((sum, item) => sum + item.count, 0) +
      result.items.filter((item) => item.kind === 'drop').length;
    assert.equal(covered, result.metrics.visibleCount);
  });

  it('supports selection after clustering changes', () => {
    const wide = regionFromZoom(15.49, 73.83, 10);
    const clustered = prepareMapPipeline({
      datasetSize: 50,
      region: wide,
      zoom: 10,
      clusterMode: 'hierarchical',
    });
    assert.ok(clustered.metrics.itemCount > 0);

    const tight = regionFromZoom(15.49, 73.83, 15);
    const expanded = prepareMapPipeline({
      datasetSize: 50,
      region: tight,
      zoom: 15,
      clusterMode: 'hierarchical',
    });
    const drop =
      expanded.items.find((item) => item.kind === 'drop')?.drop ?? expanded.dataset[0];
    assert.ok(drop);
    const selected = selectProbeDrop(null, drop);
    assert.equal(selected.preview.open, true);
    assert.equal(selected.selectedId, drop.id);
  });

  it('builds GeoJSON with longitude-first coordinates', () => {
    const region = regionFromZoom(15.49, 73.83, 11);
    const result = prepareMapPipeline({
      datasetSize: 50,
      region,
      zoom: 11,
    });
    const geo = itemsToGeoJson(result.items);
    assert.equal(geo.type, 'FeatureCollection');
    assert.ok(geo.features.length > 0);
    for (const feature of geo.features) {
      const [lng, lat] = feature.geometry.coordinates;
      assert.ok(lng > 70 && lng < 80);
      assert.ok(lat > 10 && lat < 20);
    }
  });

  it('handles empty datasets', () => {
    const region = regionFromZoom(15.49, 73.83, 11);
    const result = prepareMapPipeline({
      datasetSize: 0,
      region,
      zoom: 11,
    });
    assert.equal(result.metrics.itemCount, 0);
    assert.deepEqual(itemsToGeoJson(result.items).features, []);
  });

  it('compares hierarchical vs grid cluster modes', () => {
    const region = regionFromZoom(15.49, 73.83, 11);
    const grid = prepareMapPipeline({
      datasetSize: 1000,
      region,
      zoom: 11,
      clusterMode: 'grid',
    });
    const hierarchical = prepareMapPipeline({
      datasetSize: 1000,
      region,
      zoom: 11,
      clusterMode: 'hierarchical',
    });
    assert.ok(grid.metrics.itemCount > 0);
    assert.ok(hierarchical.metrics.itemCount > 0);
  });
});
