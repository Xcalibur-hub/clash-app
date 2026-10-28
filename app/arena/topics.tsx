import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { ArenaTopics } from '../../components/arena/ArenaTopics';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { press as hapticPress } from '../../utils/haptics';
import type { Stance } from '../../services/liveArenaService';
import { layout, useThemeColors } from '../../theme';

/** Discover constellation — previously Home `topics` mode. */
export default function ArenaDiscoverScreen(): React.JSX.Element {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const requireAuth = useRequireAuth();

  const openTopic = React.useCallback(
    (topicId: string, stance?: Stance): void => {
      if (!requireAuth()) return;
      hapticPress();
      router.push(stance ? `/arena/topic/${topicId}?stance=${stance}` : `/arena/topic/${topicId}`);
    },
    [requireAuth, router],
  );

  const openRoom = React.useCallback(
    (roomId: string): void => {
      if (!requireAuth()) return;
      hapticPress();
      router.push(`/arena/room/${roomId}`);
    },
    [requireAuth, router],
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: layout.screenX,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          style={{ width: 44, height: 44, justifyContent: 'center' }}
        >
          <ArrowLeft color={t.textPrimary} size={22} />
        </Pressable>
        <Text style={{ color: t.textPrimary, fontSize: 18, fontWeight: '700' }}>Discover</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <ArenaTopics onOpenTopic={openTopic} onOpenRoom={openRoom} />
      </ScrollView>
    </View>
  );
}
