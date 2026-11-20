/**
 * Foreground-only location seam for World.
 *
 * Never requests Always / background permission.
 * Never starts continuous watchers.
 * One-shot reads only — World posts CONTENT around an area, not live presence.
 */

import * as Location from 'expo-location';

export type ForegroundPermission = 'granted' | 'denied' | 'undetermined';

export interface OneShotLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
}

export async function getForegroundPermission(): Promise<ForegroundPermission> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return 'granted';
  if (current.canAskAgain === false) return 'denied';
  return current.status === 'undetermined' ? 'undetermined' : 'denied';
}

/** Prompt for When-In-Use only. Never calls requestBackgroundPermissionsAsync. */
export async function requestForegroundPermission(): Promise<ForegroundPermission> {
  const result = await Location.requestForegroundPermissionsAsync();
  if (result.granted) return 'granted';
  return result.canAskAgain === false ? 'denied' : 'denied';
}

/**
 * Single foreground fix. Prefer last-known when fresh enough; otherwise one
 * current-position poll. No watchPositionAsync — World is intentional capture.
 */
export async function getOneShotLocation(): Promise<OneShotLocation> {
  const permission = await getForegroundPermission();
  if (permission !== 'granted') {
    throw new Error('Location permission is required to publish a World Drop.');
  }

  const last = await Location.getLastKnownPositionAsync({
    maxAge: 120_000,
    requiredAccuracy: 200,
  });
  if (last?.coords) {
    return {
      latitude: last.coords.latitude,
      longitude: last.coords.longitude,
      accuracyMeters: last.coords.accuracy ?? null,
    };
  }

  const current = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    latitude: current.coords.latitude,
    longitude: current.coords.longitude,
    accuracyMeters: current.coords.accuracy ?? null,
  };
}
