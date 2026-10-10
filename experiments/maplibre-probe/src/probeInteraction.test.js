import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { clusterExpansionZoom } from './probeCluster.js';
import { generateProbeDataset } from './probeDatasets.js';
import {
  formatHitLabel,
  isSelectionBlocked,
  resolvePressFeatures,
  selectionStillValid,
  shouldDismissPreviewOnEmptyTap,
} from './probeInteraction.js';
import { regionFromZoom } from './probeCoordinates.js';
import { prepareMapPipeline } from './probePerf.js';
import { closePreview, selectProbeDrop } from './probeSelection.js';

describe('probe interaction hardening', () => {
  const dataset = generateProbeDataset(50, 1);

  it('selects drops from GeoJSON press features', () => {
    const drop = dataset[3];
    const hit = resolvePressFeatures(
      [
        {
          properties: { kind: 'drop', id: drop.id },
          geometry: { type: 'Point', coordinates: [drop.approxLng, drop.approxLat] },
        },
      ],
      dataset,
    );
    assert.equal(hit.kind, 'drop');
    if (hit.kind === 'drop') assert.equal(hit.drop.id, drop.id);
  });

  it('prefers clusters over overlapping drops deterministically', () => {
    const drop = dataset[0];
    const hit = resolvePressFeatures(
      [
        {
          properties: { kind: 'drop', id: drop.id },
          geometry: { coordinates: [drop.approxLng, drop.approxLat] },
        },
        {
          properties: { kind: 'cluster', id: 'c:1:2', count: 4 },
          geometry: { coordinates: [73.83, 15.49] },
        },
        {
          properties: { kind: 'cluster', id: 'c:0:1', count: 2 },
          geometry: { coordinates: [73.82, 15.48] },
        },
      ],
      dataset,
    );
    assert.equal(hit.kind, 'cluster');
    if (hit.kind === 'cluster') {
      assert.equal(hit.id, 'c:0:1');
      assert.equal(hit.count, 2);
    }
  });

  it('expands cluster zoom without looping forever', () => {
    assert.equal(clusterExpansionZoom(11), 13);
    assert.equal(clusterExpansionZoom(15), 16);
    assert.equal(clusterExpansionZoom(16), 16);
  });

  it('blocks selection during camera settle windows', () => {
    assert.equal(isSelectionBlocked(1000, 1500), true);
    assert.equal(isSelectionBlocked(1600, 1500), false);
  });

  it('dismisses preview only on empty map taps', () => {
    const open = { open: true, drop: dataset[0] };
    assert.equal(shouldDismissPreviewOnEmptyTap(open, { kind: 'empty' }), true);
    assert.equal(
      shouldDismissPreviewOnEmptyTap(open, {
        kind: 'drop',
        id: dataset[0].id,
        drop: dataset[0],
      }),
      false,
    );
  });

  it('invalidates selection when dataset items no longer contain the Drop', () => {
    const selected = selectProbeDrop(null, dataset[0]);
    assert.equal(selectionStillValid(selected.selectedId, []), false);
    assert.equal(
      selectionStillValid(selected.selectedId, [
        { kind: 'drop', id: dataset[0].id, drop: dataset[0] },
      ]),
      true,
    );
    const closed = closePreview(selected.preview);
    assert.equal(closed.open, false);
  });

  it('handles rapid dataset switching without throwing', () => {
    const region = regionFromZoom(15.49, 73.83, 11);
    for (const size of [50, 5000, 50, 1000, 0]) {
      const result = prepareMapPipeline({
        datasetSize: size,
        region,
        zoom: 11,
        clusterMode: 'hierarchical',
      });
      assert.equal(result.metrics.datasetSize, size);
      assert.ok(Array.isArray(result.items));
    }
  });

  it('formats hit labels for device logs', () => {
    assert.equal(formatHitLabel({ kind: 'empty' }, 'map'), 'map:empty');
    assert.equal(
      formatHitLabel({ kind: 'cluster', id: 'c:1', latitude: 1, longitude: 2, count: 3 }, 'geojson'),
      'geojson:cluster:c:1:3',
    );
  });

  it('orders camera update blocking ahead of selection', () => {
    const blockedUntil = 5000;
    assert.equal(isSelectionBlocked(4999, blockedUntil), true);
    const hit = resolvePressFeatures([], dataset);
    assert.equal(hit.kind, 'empty');
  });
});
