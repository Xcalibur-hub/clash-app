import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommentBranch } from '../../components/arena/CommentThread';
import { PostActionsSheet } from '../../components/arena/PostActionsSheet';
import { RebuttalInput } from '../../components/arena/RebuttalInput';
import { MindshiftPanel } from '../../components/arena/MindshiftPanel';
import { TakeActionRow } from '../../components/arena/TakeActionRow';
import { TakeChallenges } from '../../components/arena/TakeChallenges';
import { QuestionVotePanel } from '../../components/arena/QuestionVotePanel';
import { TakeEditorialHeader } from '../../components/arena/TakeEditorialHeader';
import { ArenaDivider, ArenaSectionHeading } from '../../components/arena/ui/ArenaPrimitives';
import { ArenaReplySort } from '../../components/arena/ui/ArenaReplySort';
import { arena, arenaColors } from '../../theme/arena';
import { EmptyState } from '../../components/shared/EmptyState';
import { BackIcon, MoreIcon } from '../../components/shared/icons';
import { useClock } from '../../hooks/useClock';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import { takeIsArchived } from '../../utils/takeDetail';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { useTakeReaction } from '../../hooks/useTakeReaction';
import { useOperationScope } from '../../hooks/useOperationScope';
import { toggleUpvote, fetchTakeById, fetchProfilesByIds } from '../../services/apiService';
import { fetchDiscussionPage, type DiscussionCursor } from '../../services/arenaDiscussionService';
import { isSupabaseConfigured, isLocalSupabase } from '../../services/supabaseClient';
import { ClashModeSheet } from '../../components/clash/ClashModeSheet';
import { fetchEligibleChallengeTake, ChallengeEligibilityError } from '../../services/arenaChallengeService';
import { startClash, type ClashMode } from '../../services/clashEngineService';
import { analytics } from '../../services/analytics';
import { logger } from '../../services/logger';
import { fetchFollowState } from '../../services/socialService';
import { errorText, SupabaseError } from '../../services/supabaseClient';
import { useAuth } from '../../store/AuthProvider';
import {
  buildCommentTree,
  selectAuthor,
  selectCommentsForTake,
  selectHasReacted,
  selectIsSaved,
  showNotice,
  syncCommentUpvote,
  toggleCommentUpvote,
  toggleSave,
  useClash,
  type ChallengerComment,
  type CommentNode,
  type CommentSort,
  type User,
  type Take,
} from '../../store';
import { space, useThemeColors } from '../../theme';
import {
  clashStartErrorMessage,
  shouldOpenExistingClash,
  validateClashStart,
} from '../../utils/clashStart';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';
export interface MenuTarget {
  target: User;
  isSelf: boolean;
  following: boolean;
  reportTarget: { kind: 'take' | 'comment'; id: string };
}

/** Editorial Take discussion. Challenge eligibility and navigation remain server-bound. */
export default function TakeDetailScreen(): React.JSX.Element {
  const { takeId, challenge } = useLocalSearchParams<{ takeId: string | string[]; challenge?: string }>();
  const id = Array.isArray(takeId) ? takeId[0] : takeId;
  const { state, dispatch } = useClash();
  const { user,signedIn, loading: authLoading } = useAuth();
  const accountScope=`${user?.id??'guest'}:${id}`,isCurrent=useOperationScope(accountScope);
  const upvoteBusy=React.useRef(new Set<string>());
  React.useEffect(()=>{upvoteBusy.current=new Set();setReplyTo(null);setMenu(null);setFollowingAuthor(false);},[accountScope]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const react = useTakeReaction();
  const theme = useThemeColors();
  const colors = arenaColors(theme);
  const [perspectiveOpen, setPerspectiveOpen] = React.useState(false);
  const now = useClock(1000);
  const keyboardVisible = useKeyboardVisible();
  const listRef = React.useRef<FlatList<CommentNode>>(null);
  const [focusRequest, setFocusRequest] = React.useState(0);
  const variant = Constants.expoConfig?.extra?.appVariant;
  const localBadgeVisible = isLocalSupabase && (variant === 'development' ||
    (variant !== 'preview' && variant !== 'production' && __DEV__));
  const leave = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const [sort, setSort] = React.useState<CommentSort>('best');
  const [pagedRoots, setPagedRoots] = React.useState<ChallengerComment[]>([]);
  const [locallyCreated, setLocallyCreated] = React.useState<ChallengerComment[]>([]);
  React.useEffect(() => { setLocallyCreated([]); }, [accountScope]);
  const [pageCursor, setPageCursor] = React.useState<DiscussionCursor | null>(null);
  const [pageBusy, setPageBusy] = React.useState(false);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [pageReady, setPageReady] = React.useState(false);
  const [pageRetry, setPageRetry] = React.useState(0);
  const pageRequest = React.useRef(false);
  const pageSeq = React.useRef(0);
  React.useEffect(() => {
    const seq = ++pageSeq.current;
    setPagedRoots([]); setPageCursor(null); setPageReady(false); setPageError(null);
    if (!isSupabaseConfigured || !id) return;
    pageRequest.current = true; setPageBusy(true);
    void fetchDiscussionPage(id, sort).then(async (page) => {
      const profiles = await fetchProfilesByIds([...new Set(page.items.map((item) => item.authorId))]);
      if (seq !== pageSeq.current) return;
      dispatch({ type: 'discussion/profiles', users: profiles });
      setPagedRoots(page.items); setPageCursor(page.next); setPageReady(true);
    }).catch((error) => {
      if (seq === pageSeq.current) setPageError(errorText(error));
    }).finally(() => {
      if (seq === pageSeq.current) { pageRequest.current = false; setPageBusy(false); }
    });
    return () => { ++pageSeq.current; };
  }, [id, sort, accountScope, dispatch, pageRetry]);
  const loadMoreRoots = React.useCallback(() => {
    if (!id || !pageCursor || pageRequest.current) return;
    const seq = pageSeq.current;
    pageRequest.current = true; setPageBusy(true); setPageError(null);
    void fetchDiscussionPage(id, sort, null, pageCursor).then(async (page) => {
      const profiles = await fetchProfilesByIds([...new Set(page.items.map((item) => item.authorId))]);
      if (seq !== pageSeq.current) return;
      dispatch({ type: 'discussion/profiles', users: profiles });
      setPagedRoots((current) => [...current, ...page.items.filter((item) => !current.some((root) => root.id === item.id))]);
      setPageCursor(page.next);
    }).catch((error) => {
      if (seq === pageSeq.current) setPageError(errorText(error));
    }).finally(() => {
      if (seq === pageSeq.current) { pageRequest.current = false; setPageBusy(false); }
    });
  }, [id, sort, pageCursor, dispatch]);
  const [replyTo, setReplyTo] = React.useState<{ comment: ChallengerComment; handle: string } | null>(null);
  const [menu, setMenu] = React.useState<MenuTarget | null>(null);
  const [followingAuthor, setFollowingAuthor] = React.useState(false);
  const [clashComment, setClashComment] = React.useState<ChallengerComment | null>(null);
  const [clashStarting, setClashStarting] = React.useState(false);
  const [clashStartError, setClashStartError] = React.useState<string | null>(null);
  const clashCommentRef = React.useRef<ChallengerComment | null>(null);
  const clashStartingRef = React.useRef(false);

  const [takeLoad, setTakeLoad] = React.useState<{ scope: string; status: 'loading' | 'missing' | 'error'; error?: string }>({ scope: accountScope, status: 'loading' });
  const [takeRetry, setTakeRetry] = React.useState(0);
  const [remoteContext, setRemoteContext] = React.useState<{ take: Take; author: User;scope:string } | null>(null);
  const take = takeLoad.scope === accountScope && takeLoad.status === 'missing' ? undefined :
    (remoteContext?.scope === accountScope && remoteContext.take.id === id ? remoteContext.take : state.takes.find(item => item.id === id));
  const author = take ? selectAuthor(state, take.authorId) ?? (remoteContext?.scope === accountScope && remoteContext.author.id === take.authorId ? remoteContext.author : undefined) : undefined;
  useFocusEffect(React.useCallback(() => {
    if (!id) return;
    let active = true;
    setTakeLoad({ scope: accountScope, status: 'loading' });
    void fetchTakeById(id).then(async found => {
      if (!active || !isCurrent()) return;
      if (!found) { setTakeLoad({ scope: accountScope, status: 'missing' }); return; }
      const [profile] = await fetchProfilesByIds([found.authorId]);
      if (!active || !isCurrent()) return;
      if (profile) setRemoteContext({ take: found, author: profile, scope: accountScope });
      else setTakeLoad({ scope: accountScope, status: 'missing' });
    }).catch(e => { if (active && isCurrent()) setTakeLoad({ scope: accountScope, status: 'error', error: errorText(e) }); });
    return () => { active = false; };
  }, [id, accountScope, isCurrent, takeRetry]));

  React.useEffect(() => {
    clashCommentRef.current = clashComment;
  }, [clashComment]);

  React.useEffect(() => {
    if (!take || !author) return;
    analytics.trackOnce(`take_opened:${take.id}`, 'take_opened', {
      realm: 'arena',
      hood_id: take.hood === 'for-you' ? undefined : take.hood,
      take_has_media: Boolean(take.media),
      media_type: take.media?.kind === 'video' ? 'video' : take.media ? 'image' : 'none',
    });
  }, [take, author]);

  const commentsRef = React.useRef(state.comments);
  React.useEffect(() => {
    commentsRef.current = state.comments;
  });

  React.useEffect(() => {
    if (!author || author.id === state.viewer.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const fs = await fetchFollowState(author.id);
        if (!cancelled) setFollowingAuthor(fs.following);
      } catch {
        /* follow state is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [author, state.viewer.id]);

  const upvote = React.useCallback(
    async (comment: ChallengerComment): Promise<void> => {
      if(upvoteBusy.current.has(comment.id))return;
      const baseline = commentsRef.current.find((item) => item.id === comment.id);
      const wasUpvoted = state.upvotedCommentIds.includes(comment.id);
      if (!requireAuth()) return;
      upvoteBusy.current.add(comment.id);
      hapticTap();
      dispatch(toggleCommentUpvote(comment.id));
      try {
        const result = await toggleUpvote(comment.id);
        if(!isCurrent())return;
        dispatch(syncCommentUpvote(result.commentId, result.upvoted, result.upvotesCount));
      } catch (error) {
        if(!isCurrent())return;
        dispatch(syncCommentUpvote(comment.id, wasUpvoted, baseline?.upvotes ?? 0));
        dispatch(showNotice(errorText(error)));
      } finally {if(isCurrent())upvoteBusy.current.delete(comment.id);}
    },
    [dispatch, requireAuth, state.upvotedCommentIds,isCurrent],
  );

  const refreshChallengeTake = (fresh: Take | null): void => {
    if (!fresh) { setTakeLoad({ scope: accountScope, status: 'missing' }); return; }
    if (author?.id === fresh.authorId) setRemoteContext({ scope: accountScope, take: fresh, author });
  };
  const archived = take ? take.status === 'expired' || takeIsArchived(take.expiresAt, now) : false;
  const clashChecking = React.useRef(false);
  React.useEffect(() => {
    clashChecking.current = false; clashStartingRef.current = false; clashCommentRef.current = null;
    setClashComment(null); setClashStarting(false); setClashStartError(null);
  }, [accountScope]);
  const requestReply = (): void => {
    if (archived) { listRef.current?.scrollToEnd({ animated: true }); return; }
    setReplyTo(null); setFocusRequest(n => n + 1);
  };

  const reply = React.useCallback(
    (comment: ChallengerComment): void => {
      if (archived) return;
      setFocusRequest(n => n + 1);
      const commentAuthor = selectAuthor(state, comment.authorId);
      setReplyTo({ comment, handle: commentAuthor?.handle ?? '' });
    },
    [state, archived],
  );

  const clashFromComment = React.useCallback(
    async (comment: ChallengerComment): Promise<void> => {
      if (!take || archived || clashChecking.current) return;
      if (authLoading) {
        dispatch(showNotice('Still signing in…'));
        return;
      }
      if (!requireAuth()) return;
      clashChecking.current = true;
      try {
        const fresh = await fetchEligibleChallengeTake(take.id, true);
        if (!isCurrent()) return;
        refreshChallengeTake(fresh);
        hapticPress(); setClashStartError(null); setClashComment(comment);
      } catch (error) {
        if (!isCurrent()) return;
        if (error instanceof ChallengeEligibilityError) refreshChallengeTake(error.take);
        dispatch(showNotice(errorText(error)));
      } finally { if (isCurrent()) clashChecking.current = false; }
    },
    [take, archived, authLoading, requireAuth, dispatch, isCurrent, author, accountScope],
  );

  const startChosenClash = React.useCallback(
    async (mode: ClashMode): Promise<void> => {
      const comment = clashCommentRef.current;
      const validation = validateClashStart({
        takeId: take?.id,
        commentId: comment?.id,
        signedIn,
        authLoading,
      });
      if (validation) {
        setClashStartError(validation);
        if (!signedIn && !authLoading) {
          router.push('/auth');
        }
        return;
      }
      if (!take || !comment || clashStartingRef.current) return;
      if (takeIsArchived(take.expiresAt, Date.now())) { setClashStartError('This Take is archived. New challenges are closed.'); return; }

      clashStartingRef.current = true;
      setClashStarting(true);
      setClashStartError(null);

      try {
        const fresh = await fetchEligibleChallengeTake(take.id, true);
        if (!isCurrent()) return;
        refreshChallengeTake(fresh);
        const clashId = await startClash(take.id, comment.id, mode);
        if (!isCurrent()) return;
        analytics.track('clash_started', { realm: 'arena', clash_mode: mode });
        // Close sheet only after success — unmounting Modal mid-flight was
        // swallowing navigation on Android.
        setClashComment(null);
        setClashStarting(false);
        clashStartingRef.current = false;
        router.push(`/clash/${take.id}`);
        if (!clashId) {
          logger.warn('start_clash returned empty id', { takeId: take.id, mode });
        }
      } catch (error) {
        if (!isCurrent()) return;
        if (error instanceof ChallengeEligibilityError) refreshChallengeTake(error.take);
        logger.warn('start_clash failed', {
          takeId: take.id,
          mode,
          code: error instanceof SupabaseError ? error.code : undefined,
        });
        if (shouldOpenExistingClash(error)) {
          setClashComment(null);
          setClashStarting(false);
          clashStartingRef.current = false;
          router.push(`/clash/${take.id}`);
          return;
        }
        setClashStartError(error instanceof ChallengeEligibilityError ? error.message : clashStartErrorMessage(error));
        setClashStarting(false);
        clashStartingRef.current = false;
      }
    },
    [take, router, signedIn, authLoading, isCurrent, author, accountScope],
  );

  const more = React.useCallback(
    (comment: ChallengerComment): void => {
      const commentAuthor = selectAuthor(state, comment.authorId);
      if (!commentAuthor) return;
      setMenu({
        target: commentAuthor,
        isSelf: commentAuthor.id === state.viewer.id,
        following: false,
        reportTarget: { kind: 'comment', id: comment.id },
      });
    },
    [state],
  );

  if (!take || !author) {
    return (
      <View
        style={[
          styles.root,
          styles.missing,
          { backgroundColor: theme.background, paddingTop: insets.top + space.md },
        ]}
      >
        {takeLoad.scope !== accountScope || takeLoad.status === 'loading' ? (
          <View style={{ gap: 16 }} accessibilityLabel="Loading Take">
            <ActivityIndicator color={theme.textMuted} />
            <Text style={{ color: theme.textSecondary }}>Loading discussion…</Text>
            <Pressable accessibilityRole="button" onPress={leave}><Text style={{ color: theme.textPrimary }}>Back</Text></Pressable>
          </View>
        ) : (
          <EmptyState icon={BackIcon}
            title={takeLoad.status === 'error' ? "Couldn't load this Take" : 'Take unavailable'}
            body={takeLoad.status === 'error' ? takeLoad.error ?? 'Please try again.' : 'It may have been removed or you may no longer have access.'}
            actionLabel={takeLoad.status === 'error' ? 'RETRY' : 'BACK'}
            onAction={takeLoad.status === 'error' ? () => setTakeRetry(n => n + 1) : leave} />
        )}
      </View>
    );
  }

  const comments = selectCommentsForTake(state, take.id);
  // Only server-returned roots become top-level threads. Existing hydrated
  // children are attached when available, never promoted as orphan roots.
  const nodes = pageReady
    ? [...locallyCreated.filter((item) => !item.parentId && item.takeId === take.id &&
        !pagedRoots.some((root) => root.id === item.id)), ...pagedRoots]
        .map((root): CommentNode => ({ comment: root, children: [] }))
    : buildCommentTree(comments, sort);
  const isViewerAuthor = author.id === state.viewer.id;

  const openClash = (): void => {
    if (!requireAuth()) return;
    hapticPress();
    router.push(`/clash/${take.id}`);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.fill}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.stickyTop, { paddingTop: insets.top + space.xs, backgroundColor: theme.background, borderBottomColor: theme.border }]}>
          <View style={[styles.topRow, localBadgeVisible && { paddingLeft: 52 }]}>
            <Pressable
              onPress={leave}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              style={styles.iconHit}
            >
              <BackIcon size={20} color={theme.textPrimary} />
            </Pressable>
            <Text style={[arena.type.label, { color: colors.secondary, flex: 1, minWidth: 0, textAlign: 'center' }]}>
              Arena / Discussion
            </Text>
            <Pressable
              onPress={() =>
                setMenu({
                  target: author,
                  isSelf: isViewerAuthor,
                  following: followingAuthor,
                  reportTarget: { kind: 'take', id: take.id },
                })
              }
              accessibilityRole="button"
              accessibilityLabel="More actions"
              hitSlop={8}
              style={styles.iconHit}
            >
              <MoreIcon size={20} color={theme.textMuted} strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>
        <FlatList<CommentNode>
          ref={listRef}
          key={`${take.id}:${sort}`}
          data={nodes}
          keyExtractor={(node) => node.comment.id}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          initialNumToRender={5}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews={false}
          contentContainerStyle={styles.content}
          renderItem={({ item }) => (
            <View style={[styles.threadItem, { borderBottomColor: theme.border }]}>
              <CommentBranch node={item} serverReplies={pageReady} locallyCreated={locallyCreated} takeAuthorId={author.id} readOnly={archived}
                onUpvote={upvote} onReply={reply}
                onClash={clashFromComment} onMore={more} />
            </View>
          )}
          ListFooterComponent={pageError || pageBusy || pageCursor ?
            <View style={styles.pagingFooter}>
              {pageError ? <Text style={{ color: theme.textMuted }}>{pageError}</Text> : null}
              {pageBusy ? <Text style={{ color: theme.textMuted }}>Loading conversations…</Text> : null}
              {pageReady && pageCursor && !pageBusy ? (
                <Pressable accessibilityRole="button" onPress={loadMoreRoots}
                  style={[styles.pageButton, { backgroundColor: theme.surfaceElevated }]}>
                  <Text style={{ color: theme.textPrimary, fontWeight: '800' }}>Load more conversations ↓</Text>
                </Pressable>
              ) : null}
              {pageError && !pageBusy && isSupabaseConfigured ? (
                <Pressable accessibilityRole="button" onPress={() => setPageRetry((count) => count + 1)}>
                  <Text style={{ color: theme.textPrimary }}>Retry loading conversations</Text>
                </Pressable>
              ) : null}
            </View> : null
          }
          ListEmptyComponent={pageBusy || pageError || (isSupabaseConfigured && !pageReady) ? null :
            <View style={styles.empty}>
              <Text style={[arena.type.heading, { color: colors.ink }]}>{archived ? 'A quiet discussion' : 'Start the conversation'}</Text>
              <Text style={[arena.type.body, { color: colors.muted }]}>{archived ? 'No replies were posted.' : 'No replies yet — add your perspective.'}</Text>
            </View>
          }
          ListHeaderComponent={
            <View style={styles.headerContent}>
          <TakeEditorialHeader take={take} author={author} archived={archived} isViewer={isViewerAuthor} />
          <TakeActionRow
            reactions={take.reactions}
            commentCount={comments.length}
            isSaved={selectIsSaved(state, take.id)}
            hasReacted={selectHasReacted(state, take.id)}
            readOnly={archived}
            onReact={() => { if (!archived) void react(take); }}
            onComment={requestReply}
            onClash={openClash}
            onShare={() => void Share.share({ message: `CLASH — @${author.handle}: "${take.text}"` })}
            onSave={() => {
              if (requireAuth()) dispatch(toggleSave(take.id));
            }}
            prominence="conversation"
          />
          <ArenaDivider />
          <TakeChallenges compact take={take} openComposer={challenge === '1'} readOnly={archived} onTakeRefreshed={refreshChallengeTake} />
          <View style={[styles.perspective, { borderColor: colors.line }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={take.question ? 'Question voting' : 'Your perspective'}
              accessibilityState={{ expanded: perspectiveOpen }} onPress={() => setPerspectiveOpen(value => !value)} style={styles.perspectiveToggle}>
              <Text style={[arena.type.label, { color: colors.secondary }]}>{take.question ? 'Question voting' : 'Your perspective'}</Text>
              <Text style={[arena.type.label, { color: colors.muted }]}>{perspectiveOpen ? '−' : '+'}</Text>
            </Pressable>
            {perspectiveOpen ? (take.question ? <QuestionVotePanel takeId={take.id} choices={take.question} /> : <MindshiftPanel takeId={take.id} />) : null}
          </View>
          <ArenaSectionHeading title="Discussion" detail={pageError ? 'Couldn’t refresh discussion' : pageBusy ? 'Updating…' : isSupabaseConfigured && !pageReady ? 'Connecting…' : `Showing ${nodes.length} ${nodes.length === 1 ? 'thread' : 'threads'}`}>
            <ArenaReplySort value={sort} onChange={setSort} />
          </ArenaSectionHeading>

            </View>
          }
        />

        <View
          style={[
            styles.inputBar,
            {
              borderTopColor: theme.border,
              backgroundColor: theme.surface,
              paddingBottom: keyboardVisible ? 6 : Math.max(insets.bottom, 8),
            },
          ]}
        >
          {archived ? <View style={styles.archiveBar}>
            <Text style={[arena.type.label, { color: colors.secondary }]}>Archived discussion</Text>
            <Text style={[arena.type.meta, { color: colors.muted }]}>Replies are closed · History stays available</Text>
          </View> : <RebuttalInput
            focusRequest={focusRequest}
            takeId={take.id}
            parentId={replyTo?.comment.id}
            replyDepth={
              replyTo
                ? (() => {
                    let depth = 1;
                    let cursor: string | undefined = replyTo.comment.parentId;
                    const byId = new Map(state.comments.map((c) => [c.id, c]));
                    while (cursor) {
                      depth += 1;
                      cursor = byId.get(cursor)?.parentId;
                      if (depth > 32) break;
                    }
                    return depth;
                  })()
                : 0
            }
            replyingTo={replyTo?.handle}
            onDone={() => setReplyTo(null)}
            onCreated={(comment) => setLocallyCreated((items) => [...items.filter((item) => item.id !== comment.id), comment])}
          />}
        </View>
      </KeyboardAvoidingView>

      <PostActionsSheet
        visible={menu !== null}
        target={menu?.target ?? null}
        isSelf={menu?.isSelf ?? false}
        following={menu?.following ?? false}
        reportTarget={menu?.reportTarget ?? null}
        onClose={() => setMenu(null)}
        onMutated={() => {
          if (author && author.id !== state.viewer.id) {
            void fetchFollowState(author.id)
              .then((fs) => setFollowingAuthor(fs.following))
              .catch(() => undefined);
          }
        }}
      />
      <ClashModeSheet
        visible={clashComment !== null && !archived}
        submitting={clashStarting}
        error={clashStartError}
        onClose={() => {
          if (clashStartingRef.current) return;
          setClashStartError(null);
          setClashComment(null);
        }}
        onChoose={(mode) => void startChosenClash(mode)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }, fill: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 16, width: '100%', maxWidth: arena.measure, alignSelf: 'center' },
  stickyTop: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, zIndex: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, gap: 4 },
  iconHit: { minWidth: arena.hit, minHeight: arena.hit, justifyContent: 'center', alignItems: 'center' },
  headerContent: { gap: 0 },
  threadItem: { paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  perspective: { borderBottomWidth: StyleSheet.hairlineWidth },
  perspectiveToggle: { minHeight: arena.hit, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pagingFooter: { paddingVertical: 16, alignItems: 'center', gap: 10 },
  pageButton: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, minHeight: arena.hit },
  missing: { paddingHorizontal: 20 },
  empty: { paddingVertical: 24, gap: 6 },
  inputBar: { paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  archiveBar: { paddingVertical: 6, gap: 2 },
});
