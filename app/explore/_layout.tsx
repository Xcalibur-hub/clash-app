import { Stack } from 'expo-router';
import React from 'react';
import { useThemeColors } from '../../theme';

/** Explore stack — country surfaces push above the tab. */
export default function ExploreLayout(): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: t.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
