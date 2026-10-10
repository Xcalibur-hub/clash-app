/**
 * Hierarchical grid clustering — Supercluster-inspired, pure JS, no npm deps.
 * Uses zoom-derived cell sizes so denser zooms expand clusters without re-bucketing
 * the entire World grid algorithm.
 */

/**
 * @typedef {import('./probeDrops.js').ProbeDrop} ProbeDrop
 * @typedef {{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }} ProbeRegion
 * @typedef {import('./probeCluster.js').ProbeMapItem} ProbeMapItem
 */

/**
 * @param {number} zoom
 */
export function cellSizeForZoom(zoom) {
  const z = Number.isFinite(zoom) ? Math.max(0, Math.min(22, zoom)) : 10;
  // ~degrees per cell; shrinks geometrically with zoom.
  return Math.max(360 / 2 ** (z + 2), 0.0025);
}

/**
 * @param {readonly ProbeDrop[]} drops
 * @param {ProbeRegion} region
 * @param {number} zoom
 * @returns {import('./probeCluster.js').ProbeMapItem[]}
 */
export function clusterProbeDropsHierarchical(drops, region, zoom) {
  if (!Array.isArray(drops) || drops.length === 0) return [];

  if (region.latitudeDelta <= 0.04) {
    return drops.map((drop) => ({
      kind: 'drop',
      id: drop.id,
      latitude: drop.approxLat,
      longitude: drop.approxLng,
      drop,
    }));
  }

  const cell = cellSizeForZoom(zoom);
  /** @type {Map<string, ProbeDrop[]>} */
  const buckets = new Map();

  for (const drop of drops) {
    const y = Math.floor(drop.approxLat / cell);
    const x = Math.floor(drop.approxLng / cell);
    const key = `${y}:${x}`;
    const list = buckets.get(key);
    if (list) list.push(drop);
    else buckets.set(key, [drop]);
  }

  /** @type {import('./probeCluster.js').ProbeMapItem[]} */
  const items = [];
  for (const [key, group] of buckets) {
    if (group.length === 1) {
      const drop = group[0];
      items.push({
        kind: 'drop',
        id: drop.id,
        latitude: drop.approxLat,
        longitude: drop.approxLng,
        drop,
      });
      continue;
    }
    const latitude = group.reduce((sum, d) => sum + d.approxLat, 0) / group.length;
    const longitude = group.reduce((sum, d) => sum + d.approxLng, 0) / group.length;
    items.push({
      kind: 'cluster',
      id: `h:${key}`,
      latitude,
      longitude,
      count: group.length,
      drops: group,
    });
  }
  return items;
}
