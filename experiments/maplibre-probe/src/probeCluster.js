/**
 * Grid clustering adapted from CLASH `utils/worldCluster.ts`, using probe Drop
 * shapes only — no root-app imports and no map SDK coupling.
 */

/**
 * @typedef {import('./probeDrops.js').ProbeDrop} ProbeDrop
 * @typedef {{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }} ProbeRegion
 * @typedef {|
 *   { kind: 'drop'; id: string; latitude: number; longitude: number; drop: ProbeDrop } |
 *   { kind: 'cluster'; id: string; latitude: number; longitude: number; count: number; drops: readonly ProbeDrop[] }
 * } ProbeMapItem
 */

/**
 * @param {readonly ProbeDrop[]} drops
 * @param {ProbeRegion} region
 * @param {number} [maxClusterZoomDelta=0.04]
 * @returns {ProbeMapItem[]}
 */
export function clusterProbeDrops(drops, region, maxClusterZoomDelta = 0.04) {
  if (!Array.isArray(drops) || drops.length === 0) return [];

  if (region.latitudeDelta <= maxClusterZoomDelta) {
    return drops.map((drop) => ({
      kind: 'drop',
      id: drop.id,
      latitude: drop.approxLat,
      longitude: drop.approxLng,
      drop,
    }));
  }

  const cellLat = Math.max(region.latitudeDelta / 10, 0.008);
  const cellLng = Math.max(region.longitudeDelta / 10, 0.008);
  /** @type {Map<string, ProbeDrop[]>} */
  const buckets = new Map();

  for (const drop of drops) {
    // Floor division stays stable across the antimeridian for this small Goa fixture set.
    const y = Math.floor(drop.approxLat / cellLat);
    const x = Math.floor(drop.approxLng / cellLng);
    const key = `${y}:${x}`;
    const list = buckets.get(key);
    if (list) list.push(drop);
    else buckets.set(key, [drop]);
  }

  /** @type {ProbeMapItem[]} */
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
      id: `c:${key}`,
      latitude,
      longitude,
      count: group.length,
      drops: group,
    });
  }
  return items;
}

/**
 * Target zoom for expanding a cluster without oscillating the camera.
 * Each expansion steps in by ~2 zoom levels, capped.
 *
 * @param {number} currentZoom
 * @param {number} [step=2]
 * @param {number} [maxZoom=16]
 */
export function clusterExpansionZoom(currentZoom, step = 2, maxZoom = 16) {
  const base = Number.isFinite(currentZoom) ? currentZoom : 10;
  return Math.min(maxZoom, base + step);
}

/**
 * @param {ProbeRegion} a
 * @param {ProbeRegion} b
 * @param {number} [threshold=0.35]
 */
export function regionMovedSignificantly(a, b, threshold = 0.35) {
  const latShift = Math.abs(a.latitude - b.latitude) / Math.max(a.latitudeDelta, 0.001);
  const lngShift = Math.abs(a.longitude - b.longitude) / Math.max(a.longitudeDelta, 0.001);
  const zoomShift =
    Math.abs(a.latitudeDelta - b.latitudeDelta) / Math.max(a.latitudeDelta, 0.001);
  return latShift > threshold || lngShift > threshold || zoomShift > 0.55;
}
