/**
 * Accurate Explore country geometry (Natural Earth 110m).
 * Never device GPS — ISO A2 polygons only.
 */
import type { ExploreGeoCountry } from '../utils/exploreGeo';
import raw from './exploreWorldGeometry.json';

type GeometryFile = {
  countries: ExploreGeoCountry[];
};

const data = raw as GeometryFile;

export const EXPLORE_WORLD_GEOMETRY: readonly ExploreGeoCountry[] = data.countries;

const BY_CODE = new Map(EXPLORE_WORLD_GEOMETRY.map((c) => [c.code, c]));

export function geometryByCode(code: string | null | undefined): ExploreGeoCountry | null {
  if (!code) return null;
  return BY_CODE.get(code.toUpperCase()) ?? null;
}

export function geometryCountryList(): readonly ExploreGeoCountry[] {
  return EXPLORE_WORLD_GEOMETRY;
}
