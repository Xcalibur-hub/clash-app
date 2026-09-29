/**
 * Client-side World Drop clustering for the current camera region.
 * Pure utility — no map package coupling. Bounded and memo-friendly.
 */

import type { WorldDrop } from '../services/worldService';

export interface MapRegionLike {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export type WorldMapItem =
  | {
      kind: 'drop';
      id: string;
      latitude: number;
      longitude: number;
      drop: WorldDrop;
    }
  | {
      kind: 'cluster';
      id: string;
      latitude: number;
      longitude: number;
      count: number;
      drops: readonly WorldDrop[];
    };

/**
 * Grid-cluster drops at the current zoom. Cell size scales with latitudeDelta
 * so markers merge when visually overlapping and separate when zoomed in.
 */
export function clusterWorldDrops(
  drops: readonly WorldDrop[],
  region: MapRegionLike,
  maxClusterZoomDelta = 0.04,
): WorldMapItem[] {
  if (drops.length === 0) return [];

  // Fully expanded when zoomed in tightly.
  if (region.latitudeDelta <= maxClusterZoomDelta) {
    return drops.map((drop) => ({
      kind: 'drop' as const,
      id: drop.id,
      latitude: drop.approxLat,
      longitude: drop.approxLng,
      drop,
    }));
  }

  const cellLat = Math.max(region.latitudeDelta / 10, 0.008);
  const cellLng = Math.max(region.longitudeDelta / 10, 0.008);
  const buckets = new Map<string, WorldDrop[]>();

  for (const drop of drops) {
    const y = Math.floor(drop.approxLat / cellLat);
    const x = Math.floor(drop.approxLng / cellLng);
    const key = `${y}:${x}`;
    const list = buckets.get(key);
    if (list) list.push(drop);
    else buckets.set(key, [drop]);
  }

  const items: WorldMapItem[] = [];
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

/** True when the camera has moved enough to warrant a "Search this area" prompt. */
export function regionMovedSignificantly(
  a: MapRegionLike,
  b: MapRegionLike,
  threshold = 0.35,
): boolean {
  const latShift = Math.abs(a.latitude - b.latitude) / Math.max(a.latitudeDelta, 0.001);
  const lngShift = Math.abs(a.longitude - b.longitude) / Math.max(a.longitudeDelta, 0.001);
  const zoomShift =
    Math.abs(a.latitudeDelta - b.latitudeDelta) / Math.max(a.latitudeDelta, 0.001);
  return latShift > threshold || lngShift > threshold || zoomShift > 0.55;
}
