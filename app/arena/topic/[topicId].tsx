import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArenaStanceGate } from '../../../components/liveArena/ArenaStanceGate';
import { phaseLabel } from '../../../components/liveArena/liveArenaStyles';
import { EmptyState } from '../../../components/shared/EmptyState';
import { Notice } from '../../../components/shared/Notice';
import { ArenaIcon, BackIcon } from '../../../components/shared/icons';
import { useRequireAuth } from '../../../hooks/useRequireAuth';
import { analytics } from '../../../services/analytics';
import { fetchTopic, joinTopic, type LiveArenaTopic, type Stance } from '../../../services/liveArenaService';
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
 * The door into today's Topic.
 *
 * A member is forwarded straight to their room — one room per topic per person
 * is a database rule, so there is never a second room to choose. Everyone else
 * answers the stance gate first; joining is what creates the membership, and
 * the server decides which room they land in.
 *
 * `?stance=AGREE` lets the Arena card commit a stance in one tap. Joining is
 * idempotent, so a replayed deep link cannot double-join or change a stance.
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
  const [joining, setJoining] = React.useState(false);
  const autoJoined = React.useRef(false);

  const goToRoom = React.useCallback(
    (roomId: string) => {
      router.replace(`/arena/room/${roomId}`);
    },
    [router],
  );

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
        if (next.viewerJoined && next.viewerRoomId) goToRoom(next.viewerRoomId);
      } catch (error) {
        if (cancelled) return;
        dispatch(showNotice(errorText(error)));
        setTopic(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, goToRoom, signedIn, topicId]);

  const join = React.useCallback(
    async (stance: Stance): Promise<void> => {
      if (joining) return;
      if (!requireAuth()) return;
      setJoining(true);
      try {
        const result = await joinTopic(topicId, stance);
        analytics.track('arena_room_joined', { realm: 'arena', is_guest: false });
        goToRoom(result.roomId);
      } catch (error) {
        dispatch(showNotice(errorText(error)));
      } finally {
        setJoining(false);
      }
    },
    [dispatch, goToRoom, joining, requireAuth, topicId],
  );

  // A stance arriving in the URL came from an explicit Agree/Disagree tap on the
  // Arena card, so honour it once the topic is known to be joinable.
  React.useEffect(() => {
    if (autoJoined.current || !presetStance || authLoading || !signedIn) return;
    if (!topic || topic.viewerJoined || topic.status !== 'live' || topic.phase === 'closed') return;
    autoJoined.current = true;
    void join(presetStance);
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
          </View>
        ) : (
          <ArenaStanceGate
            title={topic.title}
            description={topic.description}
            secondsRemaining={topic.secondsRemaining}
            participantCount={topic.participantCount}
            busy={joining}
            onChoose={(stance) => void join(stance)}
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
  joining: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  joiningText: { ...typeScale.meta, fontSize: 13 },
});
