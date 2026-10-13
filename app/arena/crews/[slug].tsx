/**
 * Crew profile — team identity, collapsing header, join/follow, members.
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { CrewProfileHeader } from '../../../components/crews/CrewProfileHeader';
import { EmptyState } from '../../../components/shared/EmptyState';
import { BackIcon } from '../../../components/shared/icons';
import { useRequireAuth } from '../../../hooks/useRequireAuth';
import {
  followArenaCrew,
  getArenaCrew,
  joinArenaCrew,
  listArenaCrewMembers,
  requestArenaCrewJoin,
  unfollowArenaCrew,
  type ArenaCrew,
  type ArenaCrewMember,
} from '../../../services/arenaCrewService';
import { errorText } from '../../../services/supabaseClient';
import { arenaCrewErrorKey } from '../../../utils/arenaCrewPayload';
import { layout, space, typeScale, useThemeColors } from '../../../theme';
import { Users } from 'lucide-react-native';

export default function CrewProfileScreen(): React.JSX.Element {
  const { slug: slugParam } = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const requireAuth = useRequireAuth();
  const reduced = useReducedMotion();
  const scrollY = useSharedValue(0);

  const [crew, setCrew] = React.useState<ArenaCrew | null | undefined>(undefined);
  const [members, setMembers] = React.useState<ArenaCrewMember[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    if (!slug) {
      setCrew(null);
      return;
    }
    setError(null);
    try {
      const next = await getArenaCrew(slug);
      setCrew(next);
      if (next) {
        setMembers(await listArenaCrewMembers(next.id, { limit: 32 }));
      } else {
        setMembers([]);
      }
    } catch (e) {
      setError(errorText(e));
      setCrew(null);
    }
  }, [slug]);

  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      if (reduced) {
        scrollY.value = e.contentOffset.y > 120 ? 200 : 0;
      } else {
        scrollY.value = e.contentOffset.y;
      }
    },
  });

  const withCrewUpdate = async (fn: () => Promise<ArenaCrew>): Promise<void> => {
    if (!requireAuth() || !crew) return;
    setBusy(true);
    setNotice(null);
    try {
      const next = await fn();
      setCrew(next);
      setMembers(await listArenaCrewMembers(next.id, { limit: 32 }));
    } catch (e) {
      const key = arenaCrewErrorKey(errorText(e));
      if (key === 'already_in_crew') {
        setNotice('You already belong to a Crew. Leave it before joining another.');
      } else if (key === 'cooldown') {
        setNotice('Rejoin cooldown is active. Come back in a bit.');
      } else if (key === 'request_already_pending') {
        setNotice('Request already pending.');
      } else {
        setError(errorText(e));
      }
    } finally {
      setBusy(false);
    }
  };

  if (crew === undefined) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.textMuted} />
      </View>
    );
  }

  if (!crew) {
    return (
      <View style={[styles.screen, { backgroundColor: t.background }]}>
        <View style={[styles.bar, { paddingTop: insets.top }]}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Go back" style={styles.back}>
            <BackIcon size={22} color={t.textPrimary} strokeWidth={2.2} />
          </Pressable>
        </View>
        <EmptyState
          icon={Users}
          title="CREW NOT FOUND"
          body="That Crew may have moved on — or the link is off."
          actionLabel="EXPLORE CREWS"
          onAction={() => router.replace('/arena/crews')}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={[styles.floatingBack, { top: insets.top + 6 }]}
        hitSlop={8}
      >
        <BackIcon size={22} color={t.textPrimary} strokeWidth={2.2} />
      </Pressable>

      {error ? (
        <Text
          allowFontScaling={false}
          style={[styles.errorBanner, { top: insets.top + 52, color: t.textMuted }]}
        >
          {error}
        </Text>
      ) : null}

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        <CrewProfileHeader
          crew={crew}
          members={members}
          scrollY={scrollY}
          topInset={insets.top}
          busy={busy}
          notice={notice}
          onJoin={() => {
            void withCrewUpdate(() => joinArenaCrew(crew.id));
          }}
          onRequest={() => {
            void (async () => {
              if (!requireAuth()) return;
              setBusy(true);
              setNotice(null);
              try {
                await requestArenaCrewJoin(crew.id);
                await load();
                setNotice('Request sent. Hang tight.');
              } catch (e) {
                const key = arenaCrewErrorKey(errorText(e));
                if (key === 'already_in_crew') {
                  setNotice('You already belong to a Crew. Leave it before joining another.');
                } else if (key === 'request_already_pending') {
                  setNotice('Request already pending.');
                } else {
                  setError(errorText(e));
                }
              } finally {
                setBusy(false);
              }
            })();
          }}
          onFollowToggle={() => {
            void withCrewUpdate(() =>
              crew.viewer.isFollowing ? unfollowArenaCrew(crew.id) : followArenaCrew(crew.id),
            );
          }}
          onOpenMember={(profileId) => router.push(`/profile/${profileId}`)}
        />
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenX,
    paddingBottom: space.sm,
  },
  back: { width: 44, height: 44, justifyContent: 'center' },
  floatingBack: {
    position: 'absolute',
    left: layout.screenX,
    zIndex: 8,
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  errorBanner: {
    ...typeScale.meta,
    fontSize: 13,
    position: 'absolute',
    left: layout.screenX,
    right: layout.screenX,
    zIndex: 7,
  },
});
