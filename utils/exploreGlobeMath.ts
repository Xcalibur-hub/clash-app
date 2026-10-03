/**
 * Orthographic projection helpers for the Explore pseudo-3D globe.
 * Rotation is longitude-only (drag). Lat/lng never come from GPS here.
 */

const DEG = Math.PI / 180;

export function projectCountry(
  lat: number,
  lng: number,
  rotationDeg: number,
  radius: number,
): { x: number; y: number; visible: boolean; depth: number } {
  const lambda = (lng - rotationDeg) * DEG;
  const phi = lat * DEG;
  const cosPhi = Math.cos(phi);
  const x = radius * cosPhi * Math.sin(lambda);
  const y = -radius * Math.sin(phi);
  const z = cosPhi * Math.cos(lambda);
  return {
    x,
    y,
    visible: z > -0.05,
    depth: z,
  };
}

/** Nearest country under the front center of the globe. */
export function focusCountryCode(
  rotationDeg: number,
  countries: readonly { code: string; lat: number; lng: number }[],
): string | null {
  let best: { code: string; score: number } | null = null;
  for (const country of countries) {
    const projected = projectCountry(country.lat, country.lng, rotationDeg, 1);
    if (!projected.visible) continue;
    // Prefer points near the visual center (x≈0) and facing camera.
    const score = projected.depth * 2 - Math.abs(projected.x) - Math.abs(projected.y) * 0.35;
    if (!best || score > best.score) best = { code: country.code, score };
  }
  return best?.code ?? null;
}

export function rotationToward(lng: number): number {
  // Bring longitude to front (lambda ≈ 0).
  return lng;
}

export function wrapRotation(deg: number): number {
  let n = deg % 360;
  if (n > 180) n -= 360;
  if (n < -180) n += 360;
  return n;
}
