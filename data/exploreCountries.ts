/**
 * Curated ISO country catalogue for Explore search/focus labels.
 * Lat/lng are geometry-aligned centroids — never user GPS.
 * Full polygons live in exploreWorldGeometry.json.
 */

export interface ExploreCountry {
  code: string;
  name: string;
  lat: number;
  lng: number;
}

export const EXPLORE_COUNTRIES: readonly ExploreCountry[] = [
  { code: 'IN', name: 'India', lat: 24.05, lng: 83.78 },
  { code: 'JP', name: 'Japan', lat: 37.28, lng: 137.32 },
  { code: 'KR', name: 'South Korea', lat: 36.4, lng: 127.8 },
  { code: 'US', name: 'United States', lat: 38.32, lng: -90.49 },
  { code: 'GB', name: 'United Kingdom', lat: 54.03, lng: -4.01 },
  { code: 'BR', name: 'Brazil', lat: -10.8, lng: -53.1 },
  { code: 'DE', name: 'Germany', lat: 51.2, lng: 10.4 },
  { code: 'FR', name: 'France', lat: 46.6, lng: 2.5 },
  { code: 'NG', name: 'Nigeria', lat: 9.6, lng: 8.1 },
  { code: 'MX', name: 'Mexico', lat: 23.8, lng: -102.3 },
  { code: 'AU', name: 'Australia', lat: -25.7, lng: 134.5 },
  { code: 'CA', name: 'Canada', lat: 60.1, lng: -100.2 },
  { code: 'ID', name: 'Indonesia', lat: -2.2, lng: 117.2 },
  { code: 'PH', name: 'Philippines', lat: 12.1, lng: 122.9 },
  { code: 'ZA', name: 'South Africa', lat: -29.0, lng: 25.1 },
  { code: 'EG', name: 'Egypt', lat: 26.8, lng: 30.8 },
  { code: 'TR', name: 'Turkey', lat: 39.1, lng: 35.2 },
  { code: 'IT', name: 'Italy', lat: 42.8, lng: 12.1 },
  { code: 'ES', name: 'Spain', lat: 40.2, lng: -3.7 },
  { code: 'AR', name: 'Argentina', lat: -35.2, lng: -65.2 },
  { code: 'SE', name: 'Sweden', lat: 62.2, lng: 16.4 },
  { code: 'PL', name: 'Poland', lat: 52.1, lng: 19.4 },
  { code: 'NL', name: 'Netherlands', lat: 52.1, lng: 5.3 },
  { code: 'AE', name: 'United Arab Emirates', lat: 23.9, lng: 54.3 },
  { code: 'SG', name: 'Singapore', lat: 1.35, lng: 103.82 },
  { code: 'TH', name: 'Thailand', lat: 15.5, lng: 101.3 },
  { code: 'VN', name: 'Vietnam', lat: 16.1, lng: 107.8 },
  { code: 'PK', name: 'Pakistan', lat: 29.9, lng: 69.3 },
  { code: 'BD', name: 'Bangladesh', lat: 23.8, lng: 90.3 },
  { code: 'KE', name: 'Kenya', lat: 0.5, lng: 37.9 },
  { code: 'GH', name: 'Ghana', lat: 7.9, lng: -1.2 },
  { code: 'CO', name: 'Colombia', lat: 3.9, lng: -73.1 },
  { code: 'CL', name: 'Chile', lat: -35.7, lng: -71.5 },
  { code: 'NZ', name: 'New Zealand', lat: -41.5, lng: 172.8 },
  { code: 'IE', name: 'Ireland', lat: 53.3, lng: -7.7 },
  { code: 'PT', name: 'Portugal', lat: 39.6, lng: -8.1 },
  { code: 'IS', name: 'Iceland', lat: 64.96, lng: -19.02 },
  { code: 'FI', name: 'Finland', lat: 64.2, lng: 26.3 },
  { code: 'NO', name: 'Norway', lat: 64.5, lng: 11.5 },
  { code: 'CH', name: 'Switzerland', lat: 46.8, lng: 8.2 },
  { code: 'CN', name: 'China', lat: 35.9, lng: 104.2 },
  { code: 'RU', name: 'Russia', lat: 61.5, lng: 99.0 },
] as const;

const BY_CODE = new Map(EXPLORE_COUNTRIES.map((c) => [c.code, c]));

export function countryByCode(code: string | null | undefined): ExploreCountry | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  return BY_CODE.get(upper) ?? null;
}

export function searchCountries(query: string, limit = 12): ExploreCountry[] {
  const q = query.trim().toLowerCase();
  if (!q) return EXPLORE_COUNTRIES.slice(0, limit);
  return EXPLORE_COUNTRIES.filter(
    (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q,
  ).slice(0, limit);
}
