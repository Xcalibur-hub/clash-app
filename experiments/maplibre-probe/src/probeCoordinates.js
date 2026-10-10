/**
 * MapLibre uses [longitude, latitude]. Probe helpers keep that order explicit.
 */

/**
 * @param {{ latitude: number; longitude: number }} point
 * @returns {[number, number]}
 */
export function toMapLibreLngLat(point) {
  return [point.longitude, point.latitude];
}

/**
 * @param {readonly [number, number] | number[]} lngLat
 * @returns {{ latitude: number; longitude: number }}
 */
export function fromMapLibreLngLat(lngLat) {
  return { longitude: lngLat[0], latitude: lngLat[1] };
}

/**
 * Approximate a World-style region from a MapLibre camera zoom.
 * Used only for grid clustering thresholds inside the probe.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} zoom
 * @returns {{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }}
 */
export function regionFromZoom(latitude, longitude, zoom) {
  const safeZoom = Number.isFinite(zoom) ? Math.max(0, Math.min(22, zoom)) : 10;
  const latitudeDelta = 360 / 2 ** safeZoom;
  const cosLat = Math.max(Math.cos((latitude * Math.PI) / 180), 0.2);
  const longitudeDelta = latitudeDelta / cosLat;
  return { latitude, longitude, latitudeDelta, longitudeDelta };
}
