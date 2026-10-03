/**
 * Explore geography: equirectangular (MAP) + orthographic (GLOBE) projections.
 * Geometry is Natural Earth 110m (ISO A2). Never GPS / device location.
 */

export interface ExploreGeoCountry {
  code: string;
  name: string;
  lat: number;
  lng: number;
  polygons: number[][][][];
}

const DEG = Math.PI / 180;

export function wrapRotation(deg: number): number {
  let n = deg % 360;
  if (n > 180) n -= 360;
  if (n < -180) n += 360;
  return n;
}

export function rotationToward(lng: number): number {
  return lng;
}

export function focusCountryByCentroid(
  rotationDeg: number,
  countries: readonly { code: string; lat: number; lng: number }[],
): string | null {
  let best: { code: string; score: number } | null = null;
  for (const country of countries) {
    const p = projectGlobe(country.lat, country.lng, rotationDeg, 1);
    if (!p.visible) continue;
    const score = p.depth * 2 - Math.abs(p.x) - Math.abs(p.y) * 0.35;
    if (!best || score > best.score) best = { code: country.code, score };
  }
  return best?.code ?? null;
}

/** Equirectangular project → SVG viewBox coordinates. */
export function projectMap(
  lng: number,
  lat: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const x = ((lng + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x, y };
}

/** Orthographic project for globe (longitude rotation only). */
export function projectGlobe(
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
  return { x, y, visible: z > 0.02, depth: z };
}

/** Build SVG path for MAP (equirectangular). */
export function mapPathForCountry(
  country: ExploreGeoCountry,
  width: number,
  height: number,
): string {
  const parts: string[] = [];
  for (const polygon of country.polygons) {
    for (const ring of polygon) {
      if (ring.length < 3) continue;
      let d = '';
      for (let i = 0; i < ring.length; i += 1) {
        const pt = ring[i];
        if (!pt) continue;
        const { x, y } = projectMap(pt[0]!, pt[1]!, width, height);
        d += i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`;
      }
      d += 'Z';
      parts.push(d);
    }
  }
  return parts.join(' ');
}

/** Build SVG path for GLOBE — only front-facing segments. */
export function globePathForCountry(
  country: ExploreGeoCountry,
  rotationDeg: number,
  radius: number,
  cx: number,
  cy: number,
): string {
  const parts: string[] = [];
  for (const polygon of country.polygons) {
    const ring = polygon[0];
    if (!ring || ring.length < 3) continue;
    const projected = ring.map((pt) => {
      const p = projectGlobe(pt[1]!, pt[0]!, rotationDeg, radius);
      return { ...p, x: cx + p.x, y: cy + p.y };
    });
    const visibleRatio = projected.filter((p) => p.visible).length / projected.length;
    if (visibleRatio < 0.35) continue;
    let d = '';
    let started = false;
    for (const p of projected) {
      if (!p.visible) {
        started = false;
        continue;
      }
      d += started ? `L${p.x.toFixed(1)},${p.y.toFixed(1)}` : `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      started = true;
    }
    if (d) parts.push(d);
  }
  return parts.join(' ');
}

/** Point-in-polygon (ray cast) in MAP space. */
export function hitTestMapCountry(
  x: number,
  y: number,
  country: ExploreGeoCountry,
  width: number,
  height: number,
): boolean {
  for (const polygon of country.polygons) {
    const ring = polygon[0];
    if (!ring || ring.length < 3) continue;
    const pts = ring.map((pt) => projectMap(pt[0]!, pt[1]!, width, height));
    if (pointInPolygon(x, y, pts)) return true;
  }
  return false;
}

function pointInPolygon(
  x: number,
  y: number,
  pts: readonly { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const pi = pts[i]!;
    const pj = pts[j]!;
    const intersect =
      pi.y > y !== pj.y > y &&
      x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y + 0.0000001) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function countryCodeFromMapPoint(
  x: number,
  y: number,
  countries: readonly ExploreGeoCountry[],
  width: number,
  height: number,
): string | null {
  // Reverse order so smaller countries painted later win if overlapping.
  for (let i = countries.length - 1; i >= 0; i -= 1) {
    const c = countries[i]!;
    if (hitTestMapCountry(x, y, c, width, height)) return c.code;
  }
  return null;
}
