import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../store/AuthProvider';
import { useRetryableRead } from '../../hooks/useRetryableRead';
import { fetchExploreLive } from '../../services/exploreService';
import { space, typeScale, useThemeColors } from '../../theme';
import { ReadFeedback } from '../shared/ReadFeedback';
import { ExploreMediaTile } from './ExploreMediaTile';
import { ExploreDiscoveryCard } from './ExploreDiscoveryCard';

const loadLive = () => fetchExploreLive(20);
export function useExploreLive() {
  const { user } = useAuth();
  return useRetryableRead(loadLive, user?.id ?? 'guest');
}

/** Independent of World/For You requests: only a successful response can be empty. */
export function ExploreLivePanel({ live }: { live: ReturnType<typeof useExploreLive> }): React.JSX.Element {
  const t = useThemeColors(), router = useRouter();
  return (
    <View style={{ gap: space.sm }}>
      <Text accessibilityRole="header" style={{ ...typeScale.caption, color: t.textMuted }}>LIVE</Text>
      <ReadFeedback status={live.status} subject="Live activity" retry={live.retry} />
      {live.status === 'ready' && live.data ? <>
        {live.data.topics.length === 0 && live.data.takes.length === 0 ? (
          <Text style={{ color: t.textMuted }}>No live activity right now.</Text>
        ) : null}
        {live.data.topics.map(topic => (
          <ExploreMediaTile key={topic.id} kind="LIVE" title={topic.title} subtitle={topic.hood}
            accent={t.surfaceMuted} span="hero" onPress={() => router.push(topic.href as never)} />
        ))}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {live.data.takes.map(take => (
            <ExploreDiscoveryCard key={take.id} kind="TAKE" title={take.title} subtitle={take.subtitle}
              mediaUrl={take.mediaUrl} meta={`Heat ${take.heat}`} onPress={() => router.push(take.href as never)} />
          ))}
        </ScrollView>
      </> : null}
    </View>
  );
}
