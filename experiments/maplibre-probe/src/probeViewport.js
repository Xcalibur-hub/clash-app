/**
 * Viewport filtering so high-volume datasets never mount thousands of RN views.
 */

/**
 * @typedef {import('./probeDrops.js').ProbeDrop} ProbeDrop
 * @typedef {{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }} ProbeRegion
 */

/**
 * Expand a camera region by a fractional pad on each axis.
 * @param {ProbeRegion} region
 * @param {number} [padFraction=0.35]
 * @returns {ProbeRegion}
 */
export function expandRegion(region, padFraction = 0.35) {
  const latPad = region.latitudeDelta * padFraction;
  const lngPad = region.longitudeDelta * padFraction;
  return {
    latitude: region.latitude,
    longitude: region.longitude,
    latitudeDelta: region.latitudeDelta + latPad * 2,
    longitudeDelta: region.longitudeDelta + lngPad * 2,
  };
}

/**
 * @param {ProbeRegion} region
 * @param {number} lat
 * @param {number} lng
 */
export function pointInRegion(region, lat, lng) {
  const halfLat = region.latitudeDelta / 2;
  const halfLng = region.longitudeDelta / 2;
  return (
    lat >= region.latitude - halfLat &&
    lat <= region.latitude + halfLat &&
    lng >= region.longitude - halfLng &&
    lng <= region.longitude + halfLng
  );
}

/**
 * @param {readonly ProbeDrop[]} drops
 * @param {ProbeRegion} region
 * @param {number} [padFraction=0.35]
 * @returns {ProbeDrop[]}
 */
export function filterDropsInViewport(drops, region, padFraction = 0.35) {
  if (!drops.length) return [];
  const padded = expandRegion(region, padFraction);
  return drops.filter((drop) => pointInRegion(padded, drop.approxLat, drop.approxLng));
}
