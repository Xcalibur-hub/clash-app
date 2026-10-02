import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommentThread } from '../../components/arena/CommentThread';
import { PostActionsSheet } from '../../components/arena/PostActionsSheet';
import { RebuttalInput } from '../../components/arena/RebuttalInput';
import { MindshiftPanel } from '../../components/arena/MindshiftPanel';
import { TakeActionRow } from '../../components/arena/TakeActionRow';
import { TakeMedia } from '../../components/arena/TakeMedia';
import { Avatar } from '../../components/shared/Avatar';
import { EmptyState } from '../../components/shared/EmptyState';
import { SegmentedTabs } from '../../components/shared/SegmentedTabs';
import { Underline } from '../../components/shared/Doodles';
import { BackIcon, MoreIcon } from '../../components/shared/icons';
import { HOOD_LABEL } from '../../data/hoods';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { useTakeReaction } from '../../hooks/useTakeReaction';
import { toggleUpvote } from '../../services/apiService';
import { ClashModeSheet } from '../../components/clash/ClashModeSheet';
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
  type CommentSort,
  type User,
} from '../../store';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import {
  clashStartErrorMessage,
  shouldOpenExistingClash,
  validateClashStart,
} from '../../utils/clashStart';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';
import { timeAgo, timeLeftLabel } from '../../utils/format';

const SORTS: readonly { key: CommentSort; label: string }[] = [
  { key: 'best', label: 'Best' },
  { key: 'new', label: 'New' },
];

export interface MenuTarget {
  target: User;
  isSelf: boolean;
  following: boolean;
  reportTarget: { kind: 'take' | 'comment'; id: string };
}

/**
 * Take conversation — Arena visual language, continuous scroll:
 * Take → stance → actions → discussion. Logic unchanged.
 */
export default function TakeDetailScreen(): React.JSX.Element {
  const { takeId } = useLocalSearchParams<{ takeId: string | string[] }>();
  const id = Array.isArray(takeId) ? takeId[0] : takeId;
  const { state, dispatch } = useClash();
  const { signedIn, loading: authLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const react = useTakeReaction();
  const theme = useThemeColors();

  const [sort, setSort] = React.useState<CommentSort>('best');
  const [replyTo, setReplyTo] = React.useState<{ comment: ChallengerComment; handle: string } | null>(null);
  const [menu, setMenu] = React.useState<MenuTarget | null>(null);
  const [followingAuthor, setFollowingAuthor] = React.useState(false);
  const [clashComment, setClashComment] = React.useState<ChallengerComment | null>(null);
  const [clashStarting, setClashStarting] = React.useState(false);
  const [clashStartError, setClashStartError] = React.useState<string | null>(null);
  const clashCommentRef = React.useRef<ChallengerComment | null>(null);
  const clashStartingRef = React.useRef(false);

  const take = state.takes.find((item) => item.id === id);
  const author = take ? selectAuthor(state, take.authorId) : undefined;

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
      const baseline = commentsRef.current.find((item) => item.id === comment.id);
      const wasUpvoted = state.upvotedCommentIds.includes(comment.id);
      if (!requireAuth()) return;
      hapticTap();
      dispatch(toggleCommentUpvote(comment.id));
      try {
        const result = await toggleUpvote(comment.id);
        dispatch(syncCommentUpvote(result.commentId, result.upvoted, result.upvotesCount));
      } catch (error) {
        dispatch(syncCommentUpvote(comment.id, wasUpvoted, baseline?.upvotes ?? 0));
        dispatch(showNotice(errorText(error)));
      }
    },
    [dispatch, requireAuth, state.upvotedCommentIds],
  );

  const reply = React.useCallback(
    (comment: ChallengerComment): void => {
      const commentAuthor = selectAuthor(state, comment.authorId);
      setReplyTo({ comment, handle: commentAuthor?.handle ?? '' });
    },
    [state],
  );

  const clashFromComment = React.useCallback(
    (comment: ChallengerComment): void => {
      if (!take) return;
      if (authLoading) {
        dispatch(showNotice('Still signing in…'));
        return;
      }
      if (!requireAuth()) return;
      hapticPress();
      setClashStartError(null);
      setClashComment(comment);
    },
    [take, authLoading, requireAuth, dispatch],
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

      clashStartingRef.current = true;
      setClashStarting(true);
      setClashStartError(null);

      try {
        const clashId = await startClash(take.id, comment.id, mode);
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
        setClashStartError(clashStartErrorMessage(error));
        setClashStarting(false);
        clashStartingRef.current = false;
      }
    },
    [take, router, signedIn, authLoading],
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
        <EmptyState
          icon={BackIcon}
          title="This take is no longer live"
          body="Every take expires after 24 hours."
          actionLabel="BACK"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const comments = selectCommentsForTake(state, take.id);
  const nodes = buildCommentTree(comments, sort);
  const hasMedia = Boolean(take.media);
  const shortText = take.text.trim().length < 48;

  const openClash = (): void => {
    if (!requireAuth()) return;
    hapticPress();
    router.push(`/clash/${take.id}`);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={styles.fill}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + space.xs,
              paddingBottom: space.xl,
            },
          ]}
        >
          {/* Compact chrome */}
          <View style={styles.topRow}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              style={styles.iconHit}
            >
              <BackIcon size={20} color={theme.textPrimary} />
            </Pressable>
            <View style={styles.hoodWrap}>
              <Text allowFontScaling={false} style={[styles.hood, { color: theme.textMuted }]}>
                {HOOD_LABEL[take.hood]}
              </Text>
              <Underline size={56} opacity={0.2} color={theme.textPrimary} style={styles.hoodMark} />
            </View>
            <Pressable
              onPress={() =>
                setMenu({
                  target: author,
                  isSelf: author.id === state.viewer.id,
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

          {/* Media first when present — cinematic hero above author/copy */}
          {take.media ? (
            <View style={styles.mediaFrame}>
              <TakeMedia media={take.media} variant="detail" />
            </View>
          ) : null}

          <View style={styles.authorRow}>
            <Avatar name={author.name} tint={author.tint} size={34} />
            <View style={styles.authorText}>
              <Text allowFontScaling={false} style={[styles.authorName, { color: theme.textPrimary }]} numberOfLines={1}>
                {author.name}
              </Text>
              <Text allowFontScaling={false} style={[styles.authorMeta, { color: theme.textMuted }]} numberOfLines={1}>
                @{author.handle} · {timeAgo(take.createdAt)} · {timeLeftLabel(take.expiresAt)}
              </Text>
            </View>
          </View>

          <Text
            allowFontScaling
            style={[
              hasMedia ? styles.takeWithMedia : shortText ? styles.takeShort : styles.takeLong,
              { color: theme.textPrimary },
            ]}
          >
            {take.text}
          </Text>

          <MindshiftPanel takeId={take.id} />

          <TakeActionRow
            reactions={take.reactions}
            commentCount={comments.length}
            isSaved={selectIsSaved(state, take.id)}
            hasReacted={selectHasReacted(state, take.id)}
            onReact={() => void react(take)}
            onComment={() => setReplyTo(null)}
            onClash={openClash}
            onShare={() => void Share.share({ message: `CLASH — @${author.handle}: "${take.text}"` })}
            onSave={() => {
              if (requireAuth()) dispatch(toggleSave(take.id));
            }}
            prominence="conversation"
          />

          <View style={[styles.threadHead, { borderTopColor: theme.border }]}>
            <Text allowFontScaling={false} style={[styles.threadTitle, { color: theme.textPrimary }]}>
              {comments.length === 0 ? 'Conversation' : `${comments.length} replies`}
            </Text>
            <View style={styles.sortWrap}>
              <SegmentedTabs<CommentSort> value={sort} items={SORTS} onChange={setSort} label="Sort replies" compact />
            </View>
          </View>

          {nodes.length === 0 ? (
            <Text allowFontScaling={false} style={[styles.empty, { color: theme.textMuted }]}>
              No replies yet — add the first take on this take.
            </Text>
          ) : (
            <CommentThread
              nodes={nodes}
              takeAuthorId={author.id}
              onUpvote={upvote}
              onReply={reply}
              onClash={clashFromComment}
              onMore={more}
            />
          )}
        </ScrollView>

        <View
          style={[
            styles.inputBar,
            {
              borderTopColor: theme.border,
              backgroundColor: theme.background,
              paddingBottom: Math.max(insets.bottom, space.sm),
            },
          ]}
        >
          <RebuttalInput
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
          />
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
        visible={clashComment !== null}
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
  root: { flex: 1 },
  fill: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenX,
    gap: space.md,
  },
  missing: { paddingHorizontal: space.lg },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  iconHit: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  hoodWrap: { alignItems: 'center', paddingBottom: 2 },
  hood: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  hoodMark: { marginTop: -1 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  authorText: { flex: 1, gap: 1 },
  authorName: { ...typeScale.label, fontWeight: '700', fontSize: 15 },
  authorMeta: { ...typeScale.meta, fontSize: 12 },
  takeWithMedia: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  takeShort: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.9,
    paddingVertical: space.sm,
  },
  takeLong: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  mediaFrame: {
    borderRadius: radius.xxl,
    overflow: 'hidden',
    marginHorizontal: -4,
  },
  threadHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  threadTitle: {
    ...typeScale.section,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  sortWrap: { maxWidth: 148 },
  empty: {
    ...typeScale.meta,
    fontSize: 14,
    paddingVertical: space.lg,
    lineHeight: 20,
  },
  inputBar: {
    paddingHorizontal: layout.screenX,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
