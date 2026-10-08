import React from 'react';
import { Stack } from 'expo-router';
import { useThemeColors } from '../../theme';

/**
 * Live Arena stack — Topic door → Room event.
 * Nested under root so Expo Router registers `arena/topic` and `arena/room`
 * as real children (fixes "No route named arena/room/[roomId]" warnings).
 */
export default function ArenaLayout(): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: t.background },
      }}
    >
      <Stack.Screen name="topic/[topicId]" />
      <Stack.Screen name="room/[roomId]" />
      <Stack.Screen name="challenges" />
    </Stack>
  );
}
