import React from 'react';
import { Stack } from 'expo-router';
import { useThemeColors } from '../../theme';

/** World realm stack — keeps compose / drop routes registered under `world`. */
export default function WorldLayout(): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: t.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="compose" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="drop/[dropId]" />
    </Stack>
  );
}
