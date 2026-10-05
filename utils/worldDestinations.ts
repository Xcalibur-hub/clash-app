/**
 * Coarse destination presets for placing a Creator World Drop (Phase 15.3).
 *
 * These are public city centres rounded to ~1 km — deliberately coarse. The
 * server fuzzes the point again before persisting, and no precise coordinates
 * are ever sent or stored. This is presentation data, not a location service.
 */

export interface WorldDestinationPreset {
  id: string;
  label: string;
  /** Coarse centre, rounded — never a precise reading. */
  latitude: number;
  longitude: number;
}

export const WORLD_DESTINATION_PRESETS: readonly WorldDestinationPreset[] = [
  { id: 'mumbai', label: 'Mumbai', latitude: 19.08, longitude: 72.88 },
  { id: 'delhi', label: 'Delhi', latitude: 28.61, longitude: 77.21 },
  { id: 'london', label: 'London', latitude: 51.51, longitude: -0.13 },
  { id: 'berlin', label: 'Berlin', latitude: 52.52, longitude: 13.4 },
  { id: 'new-york', label: 'New York', latitude: 40.71, longitude: -74.01 },
  { id: 'sao-paulo', label: 'São Paulo', latitude: -23.55, longitude: -46.63 },
  { id: 'tokyo', label: 'Tokyo', latitude: 35.68, longitude: 139.69 },
  { id: 'seoul', label: 'Seoul', latitude: 37.57, longitude: 126.98 },
  { id: 'sydney', label: 'Sydney', latitude: -33.87, longitude: 151.21 },
  { id: 'lagos', label: 'Lagos', latitude: 6.52, longitude: 3.38 },
];

export function worldDestinationPreset(id: string): WorldDestinationPreset | null {
  return WORLD_DESTINATION_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** Human-friendly expiry options (null = no expiry). */
export const WORLD_DROP_EXPIRY_DAYS: readonly (number | null)[] = [7, 14, 30, null];

export function worldDropExpiryLabel(days: number | null): string {
  if (days == null) return 'No expiry';
  return days === 1 ? '1 day' : `${days} days`;
}
