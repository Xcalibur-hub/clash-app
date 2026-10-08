import React from 'react';
import { FlatList, Pressable, Share, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HoodHeader } from '../../components/arena/HoodHeader';
import { PostActionsSheet } from '../../components/arena/PostActionsSheet';
import { PredictionCard } from '../../components/arena/PredictionCard';
import { PredictionComposerSheet } from '../../components/arena/PredictionComposerSheet';
import { TakeFeedItem } from '../../components/arena/TakeFeedItem';
import { EmptyState } from '../../components/shared/EmptyState';
import { Notice } from '../../components/shared/Notice';
import { SegmentedTabs } from '../../components/shared/SegmentedTabs';
import { ArenaIcon, BackIcon } from '../../components/shared/icons';
import { hoodById } from '../../data/hoods';
import { useClock } from '../../hooks/useClock';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { useTakeReaction } from '../../hooks/useTakeReaction';
import { currentViewerProfileId } from '../../services/apiService';
import {
  createPredictionGame,
  fetchActivePrediction,
  submitPrediction,
  viewerModeratesHood,
  type HoodGameView,
} from '../../services/hoodGameService';
import { fetchHoodOverview, joinHood, leaveHood, type HoodOverview } from '../../services/hoodService';
import { analytics } from '../../services/analytics';
import { fetchFollowState } from '../../services/socialService';
import { errorText } from '../../services/supabaseClient';
import {
  selectAuthor,
  selectCommentsForTake,
  selectHasReacted,
  selectHoodFeed,
  selectIsSaved,
  selectTopComment,
  showNotice,
  toggleSave,
  useClash,
  type HoodSort,
  type Take,
  type User,
} from '../../store';
import { useAuth } from '../../store/AuthProvider';
import { color, ink, space, typeScale } from '../../theme';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';

const SORTS: readonly { key: HoodSort; label: string }[] = [
  { key: 'hot', label: 'Hot' },
  { key: 'new', label: 'New' },
  { key: 'top', label: 'Top' },
];

/** The overflow sheet's target: one Take's author, resolved self/follow state. */
interface HoodMenu {
  target: User;
  take: Take;
  isSelf: boolean;
  following: boolean;
}

/** A Hood community page: header, join, sort, and its live Takes. */
export default function HoodScreen(): React.JSX.Element {
  const { hoodId } = useLocalSearchParams<{ hoodId: string | string[] }>();
  const id = Array.isArray(hoodId) ? hoodId[0] : hoodId;
  const hood = id != null ? hoodById(id as never) : undefined;
  const { state, dispatch, reloadArena } = useClash();
  const { signedIn } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useClock(30_000);
  const requireAuth = useRequireAuth();
  const react = useTakeReaction();

  const [sort, setSort] = React.useState<HoodSort>('hot');
  const [overview, setOverview] = React.useState<HoodOverview | null>(null);
  const [joining, setJoining] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [menu, setMenu] = React.useState<HoodMenu | null>(null);
  const [activeGame, setActiveGame] = React.useState<HoodGameView | null>(null);
  const [isModerator, setIsModerator] = React.useState(false);
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [gameBusy, setGameBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!hood) return;
    try {
      const profileId = signedIn ? await currentViewerProfileId() : null;
      const [nextOverview, nextGame, mod] = await Promise.all([
        fetchHoodOverview(hood.id, profileId),
        fetchActivePrediction(hood.id),
        signedIn ? viewerModeratesHood(hood.id) : Promise.resolve(false),
      ]);
      setOverview(nextOverview);
      setActiveGame(nextGame);
      setIsModerator(mod);
    } catch {
      setOverview(null);
      setActiveGame(null);
      setIsModerator(false);
    }
  }, [hood, signedIn]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const feed = React.useMemo(
    () => (hood ? selectHoodFeed(state, hood.id, sort, now) : []),
    [state, hood, sort, now],
  );

  const onRefresh = React.useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      // Re-hydrate the Arena (hood Takes come from the store) and refresh the
      // Hood's member/join/live overview + PLAY shelf.
      await Promise.all([reloadArena(), load()]);
    } finally {
      setRefreshing(false);
    }
  }, [reloadArena, load]);

  const pickPrediction = async (optionId: string): Promise<void> => {
    if (!activeGame || !requireAuth() || gameBusy) return;
    setGameBusy(true);
    try {
      await submitPrediction(activeGame.id, optionId);
      setActiveGame(await fetchActivePrediction(hood!.id));
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setGameBusy(false);
    }
  };

  const publishPrediction = async (
    question: string,
    options: string[],
    closesInHours: number,
  ): Promise<void> => {
    if (!hood || !requireAuth() || gameBusy) return;
    setGameBusy(true);
    try {
      const closesAt = new Date(Date.now() + closesInHours * 60 * 60 * 1000);
      await createPredictionGame(hood.id, question, options, closesAt);
      setComposerOpen(false);
      setActiveGame(await fetchActivePrediction(hood.id));
    } catch (error) {
      dispatch(showNotice(errorText(error)));
    } finally {
      setGameBusy(false);
    }
  };

  /**
   * Open the shared safety sheet for a Take's author — identical behaviour to the
   * main Arena feed. Follow state is fetched once per open, never per card.
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

  const toggleJoin = async (): Promise<void> => {
    if (!hood || !overview || joining) return;
    if (!requireAuth()) return;
    const wasJoined = overview.joined;
    setJoining(true);
    setOverview((o) => (o ? { ...o, joined: !o.joined, memberCount: Math.max(0, o.memberCount + (o.joined ? -1 : 1)) } : o));
    try {
      if (wasJoined) await leaveHood(hood.id);
      else {
        await joinHood(hood.id);
        analytics.track('hood_joined', { hood_id: hood.id, realm: 'arena' });
      }
      await load();
    } catch (error) {
      await load();
      dispatch(showNotice(errorText(error)));
    } finally {
      setJoining(false);
    }
  };

  const openDetail = React.useCallback((takeId: string) => router.push(`/take/${takeId}`), [router]);
  const openClash = React.useCallback(
    (takeId: string) => {
      if (!requireAuth()) return;
      hapticPress();
      router.push(`/clash/${takeId}`);
    },
    [requireAuth, router],
  );

  if (!hood) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
        <EmptyState icon={ArenaIcon} title="Hood not found" body="This community does not exist." actionLabel="BACK" onAction={() => router.back()} />
      </View>
    );
  }

  const renderItem = ({ item }: ListRenderItemInfo<Take>) => {
    const author = selectAuthor(state, item.authorId);
    if (!author) return null;
    const topComment = selectTopComment(state, item.id);
    const topAuthor = topComment ? selectAuthor(state, topComment.authorId) : undefined;
    return (
      <TakeFeedItem
        take={item}
        author={author}
        isViewer={author.id === state.viewer.id}
        isSaved={selectIsSaved(state, item.id)}
        hasReacted={selectHasReacted(state, item.id)}
        commentCount={selectCommentsForTake(state, item.id).length}
        topComment={topComment}
        topCommentAuthor={topAuthor}
        onOpenDetail={() => openDetail(item.id)}
        onOpenClash={() => openClash(item.id)}
        onReact={() => void react(item)}
        onSave={() => {
          if (requireAuth()) dispatch(toggleSave(item.id));
        }}
        onShare={() => void Share.share({ message: `CLASH — @${author.handle}: "${item.text}"` })}
        onMore={() => {
          void openMenu(item);
        }}
      />
    );
  };

  return (
    <View style={styles.root}>
      <FlatList
        data={feed}
        keyExtractor={(take) => take.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topRow}>
              <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.backBtn}>
                <BackIcon size={20} color={ink.primary} />
              </Pressable>
              <Text allowFontScaling={false} style={styles.eyebrow}>HOOD</Text>
              <View style={styles.slot} />
            </View>
            <HoodHeader
              hood={hood}
              memberCount={overview?.memberCount ?? null}
              liveCount={overview?.liveCount ?? 0}
              joined={overview?.joined ?? false}
              joining={joining}
              onToggleJoin={() => void toggleJoin()}
            />

            {(activeGame || isModerator) ? (
              <View style={styles.play}>
                <View style={styles.playHead}>
                  <Text allowFontScaling={false} style={styles.playEyebrow}>PLAY</Text>
                  {isModerator ? (
                    <Pressable
                      onPress={() => {
                        if (!requireAuth()) return;
                        hapticTap();
                        setComposerOpen(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Create Prediction"
                      hitSlop={8}
                    >
                      <Text allowFontScaling={false} style={styles.createLink}>Create Prediction</Text>
                    </Pressable>
                  ) : null}
                </View>
                {activeGame ? (
                  <PredictionCard
                    game={activeGame}
                    now={now}
                    busy={gameBusy}
                    compact
                    onPick={(optionId) => void pickPrediction(optionId)}
                    onOpen={() => router.push(`/hood/game/${activeGame.id}`)}
                  />
                ) : (
                  <Text allowFontScaling={false} style={styles.playEmpty}>
                    No live prediction yet.
                  </Text>
                )}
              </View>
            ) : null}

            <SegmentedTabs<HoodSort> value={sort} items={SORTS} onChange={setSort} label="Sort hood" />
          </View>
        }
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={<EmptyState icon={ArenaIcon} title="No live takes here" body="Every take expires after 24 hours. Check back soon." />}
        contentContainerStyle={[styles.list, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xl }]}
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
        onMutated={() => {
          // Block/mute change the Hood's live count and its visible Takes.
          void load();
        }}
      />
      <PredictionComposerSheet
        visible={composerOpen}
        busy={gameBusy}
        onClose={() => setComposerOpen(false)}
        onPublish={(question, options, hours) => {
          void publishPrediction(question, options, hours);
        }}
      />
      <Notice offset={0} />
    </View>
  );
}

function Separator(): React.JSX.Element {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  list: { flexGrow: 1 },
  header: { paddingHorizontal: space.md, gap: space.md, paddingBottom: space.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  slot: { width: 44, height: 44 },
  eyebrow: { ...typeScale.caption, color: ink.tertiary },
  play: { gap: space.sm },
  playHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playEyebrow: { ...typeScale.caption, color: ink.tertiary, letterSpacing: 0.6 },
  createLink: { ...typeScale.meta, color: ink.secondary },
  playEmpty: { ...typeScale.meta, color: ink.tertiary },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
});
