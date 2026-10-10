/**
 * Performance pipeline: prepare → viewport filter → cluster → render strategy.
 */

import { clusterProbeDrops } from './probeCluster.js';
import { getProbeDataset } from './probeDatasets.js';
import { clusterProbeDropsHierarchical } from './probeHierarchicalCluster.js';
import { filterDropsInViewport } from './probeViewport.js';

/**
 * @typedef {'grid' | 'hierarchical'} ClusterMode
 * @typedef {'markers' | 'geojson-layers'} RenderStrategy
 * @typedef {{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }} ProbeRegion
 */

/**
 * @param {number} datasetSize
 * @returns {RenderStrategy}
 */
export function chooseRenderStrategy(datasetSize) {
  // Step 6 finding (A50 / MapLibre RN 11): RN Marker views intercept map
  // touches and block GeoJSONSource hit-testing. Default to native GeoJSON
  // layers for all sizes so direct Drop/cluster taps remain reliable.
  // Marker chrome remains available via forceMarkers for visual comparison only.
  void datasetSize;
  return 'geojson-layers';
}

/**
 * Optional Marker chrome — visual only; do not use for hit-testing.
 * @param {number} datasetSize
 * @param {boolean} [forceMarkers=false]
 */
export function shouldMountMarkerChrome(datasetSize, forceMarkers = false) {
  return Boolean(forceMarkers) && datasetSize > 0 && datasetSize < 1000;
}

/**
 * Cap how many Marker views we mount even after filtering.
 * Excess drops still exist in the dataset for clustering math but are not drawn
 * as RN views — geojson strategy has no such cap.
 */
export const MAX_MARKER_VIEWS = 120;

/**
 * @param {object} input
 * @param {number} input.datasetSize
 * @param {ProbeRegion} input.region
 * @param {number} input.zoom
 * @param {ClusterMode} [input.clusterMode='hierarchical']
 * @param {number} [input.seed=1]
 */
export function prepareMapPipeline(input) {
  const clusterMode = input.clusterMode ?? 'hierarchical';
  const seed = input.seed ?? 1;

  const t0 = performance.now();
  const dataset = getProbeDataset(input.datasetSize, seed);
  const prepareMs = performance.now() - t0;

  const t1 = performance.now();
  const visible = filterDropsInViewport(dataset, input.region);
  const filterMs = performance.now() - t1;

  const t2 = performance.now();
  const items =
    clusterMode === 'grid'
      ? clusterProbeDrops(visible, input.region)
      : clusterProbeDropsHierarchical(visible, input.region, input.zoom);
  const clusterMs = performance.now() - t2;

  const strategy = chooseRenderStrategy(input.datasetSize);
  const clusterCount = items.filter((item) => item.kind === 'cluster').length;
  const dropCount = items.filter((item) => item.kind === 'drop').length;

  let renderItems = items;
  if (strategy === 'markers' && items.length > MAX_MARKER_VIEWS) {
    // Prefer clusters + a capped set of individual drops.
    const clusters = items.filter((item) => item.kind === 'cluster');
    const drops = items.filter((item) => item.kind === 'drop');
    const budget = Math.max(0, MAX_MARKER_VIEWS - clusters.length);
    renderItems = [...clusters, ...drops.slice(0, budget)];
  }

  return {
    dataset,
    visibleCount: visible.length,
    items,
    renderItems,
    strategy,
    clusterMode,
    metrics: {
      prepareMs,
      filterMs,
      clusterMs,
      totalMs: prepareMs + filterMs + clusterMs,
      visibleCount: visible.length,
      itemCount: items.length,
      clusterCount,
      dropCount,
      renderItemCount: renderItems.length,
      datasetSize: input.datasetSize,
    },
  };
}

/**
 * Convert clustered items to GeoJSON for native MapLibre layers.
 * @param {readonly import('./probeCluster.js').ProbeMapItem[]} items
 */
export function itemsToGeoJson(items) {
  return {
    type: 'FeatureCollection',
    features: items.map((item) => {
      if (item.kind === 'cluster') {
        return {
          type: 'Feature',
          id: item.id,
          properties: {
            kind: 'cluster',
            id: item.id,
            count: item.count,
            point_count: item.count,
          },
          geometry: {
            type: 'Point',
            coordinates: [item.longitude, item.latitude],
          },
        };
      }
      return {
        type: 'Feature',
        id: item.drop.id,
        properties: {
          kind: 'drop',
          id: item.drop.id,
          mediaType: item.drop.mediaType,
          hasMission: Boolean(item.drop.missionId),
          title: item.drop.title,
        },
        geometry: {
          type: 'Point',
          coordinates: [item.drop.approxLng, item.drop.approxLat],
        },
      };
    }),
  };
}

/**
 * @param {number} ms
 */
export function formatMs(ms) {
  if (!Number.isFinite(ms)) return 'n/a';
  return `${ms.toFixed(ms >= 100 ? 0 : 1)}ms`;
}
