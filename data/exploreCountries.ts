/**
 * Curated ISO country catalogue for Explore globe + search.
 * Lat/lng are approximate centroids for projection only — never user GPS.
 */

export interface ExploreCountry {
  code: string;
  name: string;
  lat: number;
  lng: number;
}

export const EXPLORE_COUNTRIES: readonly ExploreCountry[] = [
  { code: 'IN', name: 'India', lat: 20.59, lng: 78.96 },
  { code: 'JP', name: 'Japan', lat: 36.2, lng: 138.25 },
  { code: 'KR', name: 'South Korea', lat: 35.91, lng: 127.77 },
  { code: 'US', name: 'United States', lat: 37.09, lng: -95.71 },
  { code: 'GB', name: 'United Kingdom', lat: 55.38, lng: -3.44 },
  { code: 'BR', name: 'Brazil', lat: -14.24, lng: -51.93 },
  { code: 'DE', name: 'Germany', lat: 51.17, lng: 10.45 },
  { code: 'FR', name: 'France', lat: 46.23, lng: 2.21 },
  { code: 'NG', name: 'Nigeria', lat: 9.08, lng: 8.68 },
  { code: 'MX', name: 'Mexico', lat: 23.63, lng: -102.55 },
  { code: 'AU', name: 'Australia', lat: -25.27, lng: 133.78 },
  { code: 'CA', name: 'Canada', lat: 56.13, lng: -106.35 },
  { code: 'ID', name: 'Indonesia', lat: -0.79, lng: 113.92 },
  { code: 'PH', name: 'Philippines', lat: 12.88, lng: 121.77 },
  { code: 'ZA', name: 'South Africa', lat: -30.56, lng: 22.94 },
  { code: 'EG', name: 'Egypt', lat: 26.82, lng: 30.8 },
  { code: 'TR', name: 'Turkey', lat: 38.96, lng: 35.24 },
  { code: 'IT', name: 'Italy', lat: 41.87, lng: 12.57 },
  { code: 'ES', name: 'Spain', lat: 40.46, lng: -3.75 },
  { code: 'AR', name: 'Argentina', lat: -38.42, lng: -63.62 },
  { code: 'SE', name: 'Sweden', lat: 60.13, lng: 18.64 },
  { code: 'PL', name: 'Poland', lat: 51.92, lng: 19.15 },
  { code: 'NL', name: 'Netherlands', lat: 52.13, lng: 5.29 },
  { code: 'AE', name: 'United Arab Emirates', lat: 23.42, lng: 53.85 },
  { code: 'SG', name: 'Singapore', lat: 1.35, lng: 103.82 },
  { code: 'TH', name: 'Thailand', lat: 15.87, lng: 100.99 },
  { code: 'VN', name: 'Vietnam', lat: 14.06, lng: 108.28 },
  { code: 'PK', name: 'Pakistan', lat: 30.38, lng: 69.35 },
  { code: 'BD', name: 'Bangladesh', lat: 23.68, lng: 90.36 },
  { code: 'KE', name: 'Kenya', lat: -0.02, lng: 37.91 },
  { code: 'GH', name: 'Ghana', lat: 7.95, lng: -1.02 },
  { code: 'CO', name: 'Colombia', lat: 4.57, lng: -74.3 },
  { code: 'CL', name: 'Chile', lat: -35.68, lng: -71.54 },
  { code: 'NZ', name: 'New Zealand', lat: -40.9, lng: 174.89 },
  { code: 'IE', name: 'Ireland', lat: 53.14, lng: -7.69 },
  { code: 'PT', name: 'Portugal', lat: 39.4, lng: -8.22 },
  { code: 'IS', name: 'Iceland', lat: 64.96, lng: -19.02 },
  { code: 'FI', name: 'Finland', lat: 61.92, lng: 25.75 },
  { code: 'NO', name: 'Norway', lat: 60.47, lng: 8.47 },
  { code: 'CH', name: 'Switzerland', lat: 46.82, lng: 8.23 },
] as const;

const BY_CODE = new Map(EXPLORE_COUNTRIES.map((c) => [c.code, c]));

export function countryByCode(code: string | null | undefined): ExploreCountry | null {
  if (!code) return null;
  return BY_CODE.get(code.toUpperCase()) ?? null;
}

export function searchCountries(query: string, limit = 12): ExploreCountry[] {
  const q = query.trim().toLowerCase();
  if (!q) return EXPLORE_COUNTRIES.slice(0, limit);
  return EXPLORE_COUNTRIES.filter(
    (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q,
  ).slice(0, limit);
}
