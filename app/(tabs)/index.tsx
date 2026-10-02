import React from 'react';
import { FlatList, Share, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArenaTopBar } from '../../components/arena/ArenaTopBar';
import { ArenaFeaturedStack } from '../../components/arena/ArenaFeaturedStack';
import { ArenaDiscoveryRail } from '../../components/arena/ArenaDiscoveryRail';
import { ArenaTopicDeck } from '../../components/liveArena/ArenaTopicDeck';
import { FreshTakeCard, freshTakeVariant } from '../../components/arena/FreshTakeCard';
import { PostActionsSheet } from '../../components/arena/PostActionsSheet';
import { EmptyState } from '../../components/shared/EmptyState';
import { Notice } from '../../components/shared/Notice';
import { Underline } from '../../components/shared/Doodles';
import { ArenaIcon, CompassIcon, UserIcon } from '../../components/shared/icons';
import { useClock } from '../../hooks/useClock';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { currentViewerProfileId, toggleTakeReaction } from '../../services/apiService';
import { analytics } from '../../services/analytics';
import { fetchLiveTopics, type LiveArenaTopic, type Stance } from '../../services/liveArenaService';
import { fetchFollowState, fetchFollowingIds } from '../../services/socialService';
import { errorText } from '../../services/supabaseClient';
import {
  reactToTake,
  selectAuthor,
  selectCommentsForTake,
  selectFeaturedMediaTakes,
  selectFeedForScope,
  selectHasReacted,
  selectIsSaved,
  showNotice,
  syncTakeReaction,
  toggleSave,
  useClash,
  type FeedScope,
  type Take,
  type User,
} from '../../store';
import { useAuth } from '../../store/AuthProvider';
import { layout, space, typeScale, useThemeColors } from '../../theme';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';
import { DOCK_SCROLL_CLEARANCE } from '../../components/navigation/dockConfig';

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

/** The overflow sheet's target: one Take's author, resolved self/follow state. */
interface FeedMenu {
  target: User;
  take: Take;
  isSelf: boolean;
  following: boolean;
}

/** THE ARENA — the live 24h feed, Reddit-like density with CLASH identity. */
export default function ArenaScreen(): React.JSX.Element {
  const { state, dispatch, reloadArena } = useClash();
  const { signedIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useClock(30_000);
  const requireAuth = useRequireAuth();
  const theme = useThemeColors();

  const [scope, setScope] = React.useState<FeedScope>('for-you');
  const [followingIds, setFollowingIds] = React.useState<ReadonlySet<string> | null>(null);
  const [followingError, setFollowingError] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const [menu, setMenu] = React.useState<FeedMenu | null>(null);
  /** Today's live Topic(s). Empty when none is running — the card simply hides. */
  const [liveTopics, setLiveTopics] = React.useState<LiveArenaTopic[]>([]);
  /** Guards against double taps racing the reaction RPC for the same Take. */
  const reactionInFlight = React.useRef<Set<string>>(new Set());

  useFocusEffect(
    React.useCallback(() => {
      analytics.track('arena_viewed', {
        realm: 'arena',
        is_guest: !signedIn,
      });
    }, [signedIn]),
  );

  /**
   * The Live Arena card re-reads on every focus: the viewer may have joined,
   * voted or watched the topic close while they were on another screen, and the
   * card's state (Agree/Disagree vs "Enter your room") comes entirely from the
   * server's view of their membership.
   */
  const loadLiveTopics = React.useCallback(async (): Promise<void> => {
    try {
      setLiveTopics(await fetchLiveTopics());
    } catch {
      // A missing Topic is an ordinary day, not an error worth a notice.
      setLiveTopics([]);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void loadLiveTopics();
    }, [loadLiveTopics]),
  );

  // Load the signed-in viewer's follow graph once per session (Following scope).
  React.useEffect(() => {
    if (!signedIn) {
      setFollowingIds(EMPTY_SET);
      setFollowingError(false);
      return undefined;
    }
    let cancelled = false;
    setFollowingIds(null);
    setFollowingError(false);
    void (async () => {
      try {
        const profileId = await currentViewerProfileId();
        if (cancelled) return;
        const ids = profileId ? await fetchFollowingIds(profileId) : [];
        if (!cancelled) setFollowingIds(new Set(ids));
      } catch {
        if (!cancelled) {
          setFollowingError(true);
          setFollowingIds(EMPTY_SET);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, refreshKey]);

  const onRefresh = React.useCallback(async (): Promise<void> => {
    setRefreshing(true);
    // Re-resolve the Following graph and re-hydrate the live Arena.
    setRefreshKey((k) => k + 1);
    try {
      await Promise.all([reloadArena(), loadLiveTopics()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadLiveTopics, reloadArena]);

  /**
   * Open the shared safety sheet for a Take's author. Follow state is fetched
   * here — once per open, never per card — and discarded if the menu moved on.
   */
  const openMenu = React.useCallback(
    async (take: Take): Promise<void> => {
      const author = selectAuthor(state, take.authorId);
      if (!author) return;
      const isSelf = author.id === state.viewer.id;
      setMenu({ target: author, take, isSelf, following: false });
      if (isSelf || !signedIn) return;
      try {
        const followState = await fetchFollowState(author.id);
        setMenu((current) =>
          current && current.target.id === author.id
            ? { ...current, following: followState.following }
            : current,
        );
      } catch {
        /* follow state is best-effort */
      }
    },
    [state, signedIn],
  );

  const feed = React.useMemo(
    () => selectFeedForScope(state, scope, 'all', now, followingIds ?? EMPTY_SET),
    [state, scope, now, followingIds],
  );

  const featuredItems = React.useMemo(() => {
    if (state.arenaStatus !== 'ready') return [];
    return selectFeaturedMediaTakes(state, now, 8)
      .map((take) => {
        const author = selectAuthor(state, take.authorId);
        if (!author) return null;
        return {
          take,
          author,
          commentCount: selectCommentsForTake(state, take.id).length,
          isSaved: selectIsSaved(state, take.id),
          hasReacted: selectHasReacted(state, take.id),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [state, now]);

  /** Hero Takes stay in the stack only — don't immediately repeat under Fresh Takes. */
  const listFeed = React.useMemo(() => {
    if (featuredItems.length === 0) return feed;
    const featuredIds = new Set(featuredItems.map((item) => item.take.id));
    return feed.filter((take) => !featuredIds.has(take.id));
  }, [feed, featuredItems]);

  const openClash = React.useCallback(
    (takeId: string): void => {
      if (!requireAuth()) return;
      hapticPress();
      router.push(`/clash/${takeId}`);
    },
    [requireAuth, router],
  );

  const openDetail = React.useCallback(
    (takeId: string): void => router.push(`/take/${takeId}`),
    [router],
  );

  // Joining a Topic is an account-owned write, so the gate runs before the push
  // rather than letting the topic screen bounce a guest back out of the flow.
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

  // Reaction authority is `toggle_take_reaction`: tap → optimistic flip → RPC →
  // reconcile (or roll back), with an in-flight guard so double taps can't race.
  const toggleReaction = React.useCallback(
    async (take: Take): Promise<void> => {
      if (reactionInFlight.current.has(take.id)) return;
      const wasReacted = selectHasReacted(state, take.id);
      const baseline = take.reactions;
      if (!requireAuth()) return;
      reactionInFlight.current.add(take.id);
      hapticTap();
      dispatch(reactToTake(take.id));
      try {
        const result = await toggleTakeReaction(take.id);
        dispatch(syncTakeReaction(result.takeId, result.reacted, result.reactionsCount));
      } catch (error) {
        dispatch(syncTakeReaction(take.id, wasReacted, baseline));
        dispatch(showNotice(errorText(error)));
      } finally {
        reactionInFlight.current.delete(take.id);
      }
    },
    [dispatch, requireAuth, state],
  );

  const shareTake = React.useCallback(
    async (take: Take, handle: string): Promise<void> => {
      try {
        await Share.share({ message: `CLASH — @${handle}: "${take.text}"\nMake your take.` });
      } catch {
        dispatch(showNotice('Sharing is unavailable on this device.'));
      }
    },
    [dispatch],
  );

  const renderItem = React.useCallback(
    ({ item, index }: ListRenderItemInfo<Take>) => {
      const author = selectAuthor(state, item.authorId);
      if (!author) return null;
      return (
        <FreshTakeCard
          take={item}
          author={author}
          commentCount={selectCommentsForTake(state, item.id).length}
          hasReacted={selectHasReacted(state, item.id)}
          isSaved={selectIsSaved(state, item.id)}
          variant={freshTakeVariant(item, index)}
          index={index}
          now={now}
          onOpen={() => openDetail(item.id)}
          onClash={() => openClash(item.id)}
          onReact={() => {
            void toggleReaction(item);
          }}
          onSave={() => {
            if (requireAuth()) dispatch(toggleSave(item.id));
          }}
          onShare={() => {
            void shareTake(item, author.handle);
          }}
          onMore={() => {
            void openMenu(item);
          }}
        />
      );
    },
    [dispatch, now, openClash, openDetail, openMenu, requireAuth, shareTake, state, toggleReaction],
  );

  const header = React.useMemo(
    () => (
      <View style={styles.hero}>
        <ArenaDiscoveryRail scope={scope} onScopeChange={setScope} />
        <ArenaFeaturedStack
          items={featuredItems}
          loading={state.arenaStatus === 'loading'}
          onOpen={openDetail}
          onReact={(take) => {
            void toggleReaction(take);
          }}
          onComment={openDetail}
          onClash={openClash}
          onSave={(takeId) => {
            if (requireAuth()) dispatch(toggleSave(takeId));
          }}
        />
        {liveTopics.length > 0 ? (
          <ArenaTopicDeck
            topics={liveTopics}
            onOpen={(topicId) => openTopic(topicId)}
            onChoose={(topicId, stance) => openTopic(topicId, stance)}
            onWatch={(topicId) => openTopic(topicId)}
            onEnter={(topicId, roomId) => {
              if (roomId) openRoom(roomId);
              else openTopic(topicId);
            }}
            onJoinDebate={(topicId, roomId) => {
              if (roomId) openRoom(roomId);
              else openTopic(topicId);
            }}
          />
        ) : null}
        <View style={styles.freshHead}>
          <Text allowFontScaling={false} style={[styles.freshTitle, { color: theme.textPrimary }]}>
            Fresh Takes
          </Text>
          <Text allowFontScaling={false} style={[styles.freshSub, { color: theme.textMuted }]}>
            What people are arguing about now
          </Text>
          <Underline size={72} color={theme.textPrimary} opacity={0.2} style={styles.freshMark} />
        </View>
      </View>
    ),
    [
      dispatch,
      featuredItems,
      liveTopics,
      openClash,
      openDetail,
      openRoom,
      openTopic,
      requireAuth,
      scope,
      state.arenaStatus,
      theme.textPrimary,
      theme.textMuted,
      toggleReaction,
    ],
  );

  const empty = React.useMemo(() => {
    if (state.arenaStatus === 'loading') {
      return <FeedSkeleton />;
    }
    if (state.arenaStatus === 'error') {
      return (
        <EmptyState
          icon={ArenaIcon}
          title="Couldn't load Arena."
          body="Check your connection and try again."
          actionLabel="TRY AGAIN"
          onAction={() => {
            void reloadArena();
          }}
        />
      );
    }
    if (scope === 'following') {
      if (!signedIn) {
        return (
          <EmptyState
            icon={UserIcon}
            title="Follow people to build your feed"
            body="Following shows Takes from people you follow. Sign in to get a personalized feed."
            actionLabel="SIGN IN"
            onAction={() => router.push('/auth')}
          />
        );
      }
      if (followingError) {
        return (
          <EmptyState
            icon={ArenaIcon}
            title="Couldn't load your follows"
            body="Check your connection and try again."
            actionLabel="RETRY"
            onAction={() => setRefreshKey((k) => k + 1)}
          />
        );
      }
      if (followingIds === null) {
        return <FeedSkeleton />;
      }
      return (
        <EmptyState
          icon={CompassIcon}
          title="Your Following feed is empty"
          body="Follow creators and communities to fill this feed."
          actionLabel="EXPLORE"
          onAction={() => router.push('/explore')}
        />
      );
    }
    return (
      <EmptyState
        icon={ArenaIcon}
        title="No live takes right now"
        body="Every take expires after 24 hours. Try another community or check back soon."
      />
    );
  }, [
    state.arenaStatus,
    scope,
    signedIn,
    followingIds,
    followingError,
    router,
    reloadArena,
  ]);

  // Cold-start failure: no mock content underneath — only the error empty state.
  // Featured hero Takes are filtered out so they don't duplicate under Fresh Takes.
  const listData = state.arenaStatus === 'error' || state.arenaStatus === 'loading' ? [] : listFeed;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ArenaTopBar paddingTop={insets.top} />
      <FlatList
        data={listData}
        keyExtractor={(take) => take.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + DOCK_SCROLL_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={() => {
          void onRefresh();
        }}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={9}
      />
      <PostActionsSheet
        visible={menu !== null}
        target={menu?.target ?? null}
        isSelf={menu?.isSelf ?? false}
        following={menu?.following ?? false}
        reportTarget={menu ? { kind: 'take', id: menu.take.id } : null}
        onClose={() => setMenu(null)}
        onMutated={() => setRefreshKey((k) => k + 1)}
      />
      <Notice offset={0} />
    </View>
  );
}

function FeedSkeleton(): React.JSX.Element {
  const theme = useThemeColors();
  return (
    <View style={skeletonStyles.wrap}>
      {[0, 1, 2].map((row) => (
        <View key={row} style={skeletonStyles.row}>
          <View style={[skeletonStyles.avatar, { backgroundColor: theme.surfaceMuted }]} />
          <View style={skeletonStyles.lines}>
            <View style={[skeletonStyles.bar, { width: '55%', backgroundColor: theme.surfaceMuted }]} />
            <View style={[skeletonStyles.bar, { width: '92%', backgroundColor: theme.surfaceMuted }]} />
            <View style={[skeletonStyles.bar, { width: '40%', backgroundColor: theme.surfaceMuted }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flexGrow: 1 },
  hero: { paddingBottom: space.xs, gap: 2 },
  freshHead: {
    paddingHorizontal: layout.screenX,
    paddingTop: space.xl,
    paddingBottom: space.sm,
    position: 'relative',
  },
  freshTitle: {
    ...typeScale.section,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  freshSub: {
    ...typeScale.meta,
    fontSize: 13,
    marginTop: 4,
  },
  freshMark: { marginTop: 4 },
});

const skeletonStyles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.screenX, gap: space.xl, paddingVertical: space.lg },
  row: { flexDirection: 'row', gap: space.md },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  lines: { flex: 1, gap: space.xs },
  bar: { height: 12, borderRadius: 6 },
});
