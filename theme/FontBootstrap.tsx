import React from 'react';
import { View } from 'react-native';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

/**
 * Loads Inter before painting app chrome. Children still mount so splash/bootstrap
 * are not blocked forever — Text falls back to Inter family names once ready.
 */
export function FontBootstrap({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Keep structure stable; once fonts load, RN remaps family names automatically.
  if (!loaded) {
    return <View style={{ flex: 1 }}>{children}</View>;
  }

  return <>{children}</>;
}
