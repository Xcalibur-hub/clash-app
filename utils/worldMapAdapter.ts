/**
 * Provider-independent World camera and discovery contract.
 *
 * This is deliberately a pure TypeScript boundary. It does not import
 * react-native-maps or MapLibre and does not change the live World screen.
 */
import { regionMovedSignificantly, type MapRegionLike } from './worldCluster.ts';

export type WorldCameraRegion = MapRegionLike;
export type WorldCoordinate = Readonly<{ latitude: number; longitude: number }>;
export type MapLibreCoordinate = readonly [longitude: number, latitude: number];

export function toMapLibreCoordinate(point: WorldCoordinate): MapLibreCoordinate {
  return [point.longitude, point.latitude];
}

export function fromMapLibreCoordinate(coordinate: readonly [number, number]): WorldCoordinate {
  return { longitude: coordinate[0], latitude: coordinate[1] };
}

export function viewportRequiresSearch(queryOrigin: WorldCameraRegion, camera: WorldCameraRegion): boolean {
  return regionMovedSignificantly(queryOrigin, camera);
}

export type WorldMapInteraction =
  | { kind: 'camera-idle'; region: WorldCameraRegion }
  | { kind: 'drop-selected'; dropId: string }
  | { kind: 'cluster-selected'; latitude: number; longitude: number; count: number }
  | { kind: 'map-tapped' };

export interface WorldMapSurfaceContract {
  readonly initialRegion: WorldCameraRegion;
  onInteraction(interaction: WorldMapInteraction): void;
  animateToRegion(region: WorldCameraRegion, durationMs: number): void;
}
