/**
 * Whether `/world` may mount `react-native-maps` MapView on this process.
 *
 * Android Google Maps crashes the process when MapView inflates without a
 * `com.google.android.geo.API_KEY` meta-data entry in the **installed** APK.
 * Metro/`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` alone does not prove that binary
 * contains the key (Phase 4E.1). Require an explicit opt-in that operators set
 * only after a Maps-configured native rebuild.
 *
 * iOS uses Apple Maps via PROVIDER_DEFAULT and does not need that Android key.
 *
 * @param platformOS - Pass `Platform.OS` from the call site (keeps this util RN-free for unit tests).
 */
export function isWorldNativeMapAvailable(platformOS: string): boolean {
  if (platformOS === 'ios') return true;
  if (platformOS !== 'android') return false;
  const flag = process.env.EXPO_PUBLIC_WORLD_NATIVE_MAP_ANDROID?.trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}
