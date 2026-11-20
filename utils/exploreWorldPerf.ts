import type { ExploreGeoCountry } from './exploreGeo.ts';

export type WorldVisualMode = 'globe' | 'map';

/** Test/helper: inactive mode should not compute the other projection set. */
export function worldCanvasActivePaths(
  mode: WorldVisualMode,
  mapCount: number,
  globeCount: number,
): { mapActive: boolean; globeActive: boolean; paths: number } {
  if (mode === 'map') return { mapActive: true, globeActive: false, paths: mapCount };
  return { mapActive: false, globeActive: true, paths: globeCount };
}

export function simplifyCountryForGlobe(
  country: ExploreGeoCountry,
  stride = 2,
): ExploreGeoCountry {
  if (stride <= 1) return country;
  return {
    ...country,
    polygons: country.polygons.map((poly) =>
      poly.map((ring) => {
        if (ring.length <= 8) return ring;
        const out: number[][] = [];
        for (let i = 0; i < ring.length; i += stride) {
          const pt = ring[i];
          if (pt) out.push(pt);
        }
        const last = ring[ring.length - 1];
        if (last && out[out.length - 1] !== last) out.push(last);
        return out;
      }),
    ),
  };
}
