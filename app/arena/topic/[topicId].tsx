import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopicRoomDiscovery } from '../../../components/liveArena/TopicRoomDiscovery';
import { phaseLabel } from '../../../components/liveArena/liveArenaStyles';
import { EmptyState } from '../../../components/shared/EmptyState';
import { Notice } from '../../../components/shared/Notice';
import { ArenaIcon, BackIcon } from '../../../components/shared/icons';
import { useRequireAuth } from '../../../hooks/useRequireAuth';
import { analytics } from '../../../services/analytics';
import {
  fetchTopic,
  fetchTopicRooms,
  joinTopic,
  upgradeSpectator,
  watchRoom,
  type ArenaTopicRoomCard,
  type LiveArenaTopic,
  type Stance,
} from '../../../services/liveArenaService';
import { errorText } from '../../../services/supabaseClient';
import { showNotice, useClash } from '../../../store';
import { useAuth } from '../../../store/AuthProvider';
import { layout, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';

const STANCES: readonly Stance[] = ['AGREE', 'UNSURE', 'DISAGREE'];

function asStance(value: string | string[] | undefined): Stance | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && (STANCES as readonly string[]).includes(raw)
    ? (raw as Stance)
    : null;
}

/**
 * Topic door — room discovery + assignment entry.
 *
 * Joined members see Your Room and choose Enter (no silent redirect).
 * Deep-link `?stance=` still joins once, then lands on discovery with Enter Room.
 */
export default function ArenaTopicScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ topicId: string | string[]; stance?: string | string[] }>();
  const topicId = Array.isArray(params.topicId) ? params.topicId[0] : params.topicId;
  const presetStance = asStance(params.stance);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const { dispatch } = useClash();
  const { signedIn, loading: authLoading } = useAuth();
  const requireAuth = useRequireAuth();

  const [topic, setTopic] = React.useState<LiveArenaTopic | null | undefined>(undefined);
  const [rooms, setRooms] = React.useState<ArenaTopicRoomCard[]>([]);
  const [roomsLoading, setRoomsLoading] = React.useState(false);
  const [joining, setJoining] = React.useState(false);
  const autoJoined = React.useRef(false);

  const goToRoom = React.useCallback(
    (roomId: string) => {
      router.push(`/arena/room/${roomId}`);
    },
    [router],
  );

  const reloadRooms = React.useCallback(async (): Promise<void> => {
    setRoomsLoading(true);
    try {
      const next = await fetchTopicRooms(topicId);
      setRooms(next);
    } catch {
      setRooms([]);
    } finally {
      setRoomsLoading(false);
    }
  }, [topicId]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchTopic(topicId);
        if (cancelled) return;
        setTopic(next);
        analytics.trackOnce(`arena_topic_viewed:${next.id}`, 'arena_topic_viewed', {
          realm: 'arena',
          is_guest: !signedIn,
        });
        // Discovery stays visible — Enter Room is explicit. No auto-replace.
      } catch (error) {
        if (cancelled) return;
        dispatch(showNotice(errorText(error)));
        setTopic(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, signedIn, topicId]);

  React.useEffect(() => {
    if (!topic || topic.status !== 'live') return;
    void reloadRooms();
  }, [reloadRooms, topic]);

  const join = React.useCallback(
    async (stance: Stance | null, role: 'debater' | 'spectator' = 'debater'): Promise<void> => {
      if (joining) return;
      if (!requireAuth()) return;
      setJoining(true);
      try {
        const result = await joinTopic(topicId, stance, role);
        analytics.track('arena_room_joined', { realm: 'arena', is_guest: false });
        const refreshed = await fetchTopic(topicId);
        setTopic(refreshed);
        await reloadRooms();
        // After join, take them into the room — they explicitly chose a stance / watch.
        goToRoom(result.roomId);
      } catch (error) {
        dispatch(showNotice(errorText(error)));
      } finally {
        setJoining(false);
      }
    },
    [dispatch, goToRoom, joining, reloadRooms, requireAuth, topicId],
  );

  const upgrade = React.useCallback(
    async (stance: Stance): Promise<void> => {
      if (joining || !topic?.viewerRoomId) return;
      if (!requireAuth()) return;
      setJoining(true);
      try {
        await upgradeSpectator(topic.viewerRoomId, stance);
        const refreshed = await fetchTopic(topicId);
        setTopic(refreshed);
        goToRoom(topic.viewerRoomId);
      } catch (error) {
        dispatch(showNotice(errorText(error)));
      } finally {
        setJoining(false);
      }
    },
    [dispatch, goToRoom, joining, requireAuth, topic?.viewerRoomId, topicId],
  );

  const watchSpecificRoom = React.useCallback(
    async (roomId: string): Promise<void> => {
      if (joining) return;
      if (!requireAuth()) return;
      setJoining(true);
      try {
        const result = await watchRoom(roomId);
        analytics.track('arena_room_joined', { realm: 'arena', is_guest: false });
        const refreshed = await fetchTopic(topicId);
        setTopic(refreshed);
        await reloadRooms();
        goToRoom(result.roomId);
      } catch (error) {
        dispatch(showNotice(errorText(error)));
      } finally {
        setJoining(false);
      }
    },
    [dispatch, goToRoom, joining, reloadRooms, requireAuth, topicId],
  );

  // Stance deep-link from Arena card — join once, then enter room.
  React.useEffect(() => {
    if (autoJoined.current || !presetStance || authLoading || !signedIn) return;
    if (!topic || topic.viewerJoined || topic.status !== 'live' || topic.phase === 'closed') return;
    autoJoined.current = true;
    void join(presetStance, 'debater');
  }, [authLoading, join, presetStance, signedIn, topic]);

  if (topic === undefined) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.textPrimary} />
      </View>
    );
  }

  if (topic === null) {
    return (
      <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top + space.md }]}>
        <EmptyState
          icon={ArenaIcon}
          title="Topic unavailable"
          body="This Arena topic may have closed or is not open yet."
          actionLabel="BACK TO ARENA"
          onAction={() => router.replace('/(tabs)')}
        />
      </View>
    );
  }

  const closed = topic.phase === 'closed' || topic.status !== 'live';

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <View style={[styles.bar, { paddingTop: insets.top + space.xs }]}>
        <Pressable
          onPress={() => {
            hapticTap();
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)');
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
        >
          <BackIcon size={20} color={t.textPrimary} strokeWidth={2.2} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {closed ? (
          <View style={styles.closed}>
            <Text allowFontScaling={false} style={[styles.closedEyebrow, { color: t.textMuted }]}>
              {phaseLabel(topic.phase).toUpperCase()}
            </Text>
            <Text allowFontScaling={false} style={[styles.closedTitle, { color: t.textPrimary }]}>
              {topic.title}
            </Text>
            <Text allowFontScaling={false} style={[styles.closedBody, { color: t.textSecondary }]}>
              {topic.participantCount} people argued this one. A new Topic opens every day.
            </Text>
            {topic.viewerRoomId ? (
              <Pressable
                onPress={() => {
                  hapticTap();
                  goToRoom(topic.viewerRoomId as string);
                }}
                style={[styles.resultCta, { backgroundColor: t.clashFill }]}
                accessibilityRole="button"
                accessibilityLabel="See your room result"
              >
                <Text allowFontScaling={false} style={[styles.resultCtaText, { color: t.clashText }]}>
                  See your room
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <TopicRoomDiscovery
            topic={topic}
            rooms={rooms}
            roomsLoading={roomsLoading}
            busy={joining}
            onEnterRoom={goToRoom}
            onWatchRoom={(roomId) => void watchSpecificRoom(roomId)}
            onJoinDebate={(stance) => {
              if (topic.viewerRole === 'spectator' && topic.viewerRoomId) {
                void upgrade(stance);
              } else {
                void join(stance, 'debater');
              }
            }}
            onWatch={() => {
              if (topic.viewerJoined && topic.viewerRoomId) {
                goToRoom(topic.viewerRoomId);
              } else if (rooms[0]) {
                void watchSpecificRoom(rooms[0].roomId);
              } else {
                void join(null, 'spectator');
              }
            }}
          />
        )}

        {joining ? (
          <View style={styles.joining}>
            <ActivityIndicator color={t.textMuted} />
            <Text allowFontScaling={false} style={[styles.joiningText, { color: t.textMuted }]}>
              Finding you a room…
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <Notice offset={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  bar: { paddingHorizontal: layout.screenX, paddingBottom: space.xs },
  back: { width: 36, height: 36, marginLeft: -8, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: layout.screenX, paddingTop: space.sm, gap: space.md },
  closed: { gap: space.xs },
  closedEyebrow: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  closedTitle: { ...typeScale.editorial, fontSize: 24, lineHeight: 31, fontWeight: '700' },
  closedBody: { ...typeScale.body, fontSize: 15 },
  resultCta: {
    marginTop: space.md,
    minHeight: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultCtaText: { ...typeScale.label, fontSize: 15, fontWeight: '800' },
  joining: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  joiningText: { ...typeScale.meta, fontSize: 13 },
});
