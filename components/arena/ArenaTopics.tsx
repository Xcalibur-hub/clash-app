/** Canonical interests and server-filtered active discussions; no local activity fixtures. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { fetchInterestCatalogue } from '../../services/arenaInterestService';
import { fetchLiveTopics, type LiveArenaTopic } from '../../services/liveArenaService';
import type { ArenaInterest } from '../../utils/arenaInterests';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { useAuth } from '../../store/AuthProvider';
export function ArenaTopics({
  refreshToken = 0,
  onOpenTopic,
  onOpenRoom
}: {
  refreshToken?: number;
  onOpenTopic: (id: string) => void;
  onOpenRoom: (id: string) => void;
}): React.JSX.Element {
  const t = useThemeColors(),
    router = useRouter(),
    {
      signedIn
    } = useAuth();
  const [catalogue, setCatalogue] = React.useState<ArenaInterest[]>([]),
    [topics, setTopics] = React.useState<LiveArenaTopic[]>([]);
  const [loading, setLoading] = React.useState(true),
    [catalogueError, setCatalogueError] = React.useState(false),
    [topicsError, setTopicsError] = React.useState(false);
  useFocusEffect(React.useCallback(() => {
    let active = true;
    setLoading(true);
    setCatalogue([]);
    setTopics([]);
    setCatalogueError(false);
    setTopicsError(false);
    void Promise.allSettled([signedIn ? fetchInterestCatalogue() : Promise.resolve([]), fetchLiveTopics()]).then(([interests, discussions]) => {
      if (!active) return;
      if (interests.status === 'fulfilled') setCatalogue(interests.value);else setCatalogueError(true);
      if (discussions.status === 'fulfilled') setTopics(discussions.value);else setTopicsError(true);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refreshToken, signedIn]));
  return <View style={styles.wrap} accessibilityLabel="Topics and Trends">
  <Text style={[styles.title, {
      color: t.textPrimary
    }]}>Topics & Trends</Text>
  <Text style={[styles.body, {
      color: t.textSecondary
    }]}>Explore your interests and the discussions happening now.</Text>
  <Text style={[styles.heading, {
      color: t.textPrimary
    }]}>Topics</Text>
  {loading ? <Text style={{
      color: t.textMuted
    }}>Loading topics...</Text> : !signedIn ? <Pressable onPress={() => router.push('/auth')} style={styles.row} accessibilityRole="button"><Text style={{
        color: t.textPrimary
      }}>Sign in to explore the topic catalogue</Text></Pressable> : catalogueError ? <Text style={{
      color: t.textMuted
    }}>Couldn't load topics. Pull down to retry.</Text> : catalogue.length === 0 ? <Text style={{
      color: t.textMuted
    }}>No topics available.</Text> : catalogue.map(interest => <View key={interest.id} style={[styles.row, {
      borderColor: t.border
    }]}>
   <Text style={[styles.heading, {
        color: t.textPrimary
      }]}>{interest.name}</Text><Text style={[styles.body, {
        color: t.textSecondary
      }]}>{interest.description}</Text>
   {interest.hoods.map(hood => <Pressable key={hood} accessibilityRole="button" accessibilityLabel={'Explore ' + interest.name + ' in ' + hood} onPress={() => router.push('/hood/' + hood)} style={styles.link}><Text style={{
          color: t.textPrimary
        }}>Explore {interest.hoods.length > 1 ? hood : interest.name}</Text></Pressable>)}
  </View>)}
  <Text style={[styles.heading, {
      color: t.textPrimary
    }]}>Active discussions</Text>
  {loading ? <Text style={{
      color: t.textMuted
    }}>Loading discussions...</Text> : topicsError ? <Text style={{
      color: t.textMuted
    }}>Couldn't load discussions. Pull down to retry.</Text> : topics.length === 0 ? <Text style={{
      color: t.textMuted
    }}>No active discussions right now.</Text> : topics.map(topic => <Pressable key={topic.id} style={[styles.row, {
      borderColor: t.border
    }]} accessibilityRole="button" accessibilityLabel={'Open discussion ' + topic.title} onPress={() => topic.viewerRoomId ? onOpenRoom(topic.viewerRoomId) : onOpenTopic(topic.id)}><Text style={[styles.heading, {
        color: t.textPrimary
      }]}>{topic.title}</Text><Text style={{
        color: t.textMuted
      }}>Open discussion</Text></Pressable>)}
 </View>;
}
const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: layout.screenX,
    paddingTop: space.md,
    paddingBottom: space.lg,
    gap: space.sm
  },
  title: {
    ...typeScale.section,
    fontSize: 24,
    fontWeight: '800'
  },
  heading: {
    ...typeScale.label,
    fontSize: 17,
    fontWeight: '700'
  },
  body: {
    ...typeScale.meta,
    fontSize: 14,
    lineHeight: 20
  },
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
    gap: space.xs
  },
  link: {
    minHeight: 44,
    justifyContent: 'center'
  }
});
