import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
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
import { BackIcon, MoreIcon } from '../../components/shared/icons';
import { HOOD_LABEL } from '../../data/hoods';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { useTakeReaction } from '../../hooks/useTakeReaction';
import { toggleUpvote } from '../../services/apiService';
import { ClashModeSheet } from '../../components/clash/ClashModeSheet';
import { startClash, type ClashMode } from '../../services/clashEngineService';
import { fetchFollowState } from '../../services/socialService';
import { errorText, SupabaseError } from '../../services/supabaseClient';
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
import { color, ink, space, typeScale } from '../../theme';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';

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

/** Flat, threaded Take detail / discussion target. */
export default function TakeDetailScreen(): React.JSX.Element {
  const { takeId } = useLocalSearchParams<{ takeId: string | string[] }>();
  const id = Array.isArray(takeId) ? takeId[0] : takeId;
  const { state, dispatch } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const react = useTakeReaction();

  const [sort, setSort] = React.useState<CommentSort>('best');
  const [replyTo, setReplyTo] = React.useState<{ comment: ChallengerComment; handle: string } | null>(null);
  const [menu, setMenu] = React.useState<MenuTarget | null>(null);
  const [followingAuthor, setFollowingAuthor] = React.useState(false);
  const [clashComment, setClashComment] = React.useState<ChallengerComment | null>(null);

  const take = state.takes.find((item) => item.id === id);
  const author = take ? selectAuthor(state, take.authorId) : undefined;

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
      if (!take || !requireAuth()) return;
      hapticPress();
      setClashComment(comment);
    },
    [take, requireAuth],
  );

  const startChosenClash = React.useCallback(
    async (mode: ClashMode): Promise<void> => {
      if (!take || !clashComment) return;
      const commentId = clashComment.id;
      setClashComment(null);
      try {
        await startClash(take.id, commentId, mode);
        router.push(`/clash/${take.id}`);
      } catch (error) {
        if (error instanceof SupabaseError && error.code === 'P0005') {
          router.push(`/clash/${take.id}`);
        } else {
          dispatch(showNotice(errorText(error)));
        }
      }
    },
    [take, clashComment, router, dispatch],
  );

  const more = React.useCallback(
    (comment: ChallengerComment): void => {
      const commentAuthor = selectAuthor(state, comment.authorId);
      if (!commentAuthor) return;
      setMenu({ target: commentAuthor, isSelf: commentAuthor.id === state.viewer.id, following: false, reportTarget: { kind: 'comment', id: comment.id } });
    },
    [state],
  );

  if (!take || !author) {
    return (
      <View style={[styles.root, styles.missing, { paddingTop: insets.top + space.md }]}>
        <EmptyState icon={BackIcon} title="This take is no longer live" body="Every take expires after 24 hours." actionLabel="BACK" onAction={() => router.back()} />
      </View>
    );
  }

  const comments = selectCommentsForTake(state, take.id);
  const nodes = buildCommentTree(comments, sort);

  const openClash = (): void => {
    if (!requireAuth()) return;
    hapticPress();
    router.push(`/clash/${take.id}`);
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xl }]}
        >
          <View style={styles.topRow}>
            <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.backBtn}>
              <BackIcon size={20} color={ink.primary} />
            </Pressable>
            <Text allowFontScaling={false} style={styles.eyebrow}>TAKE</Text>
            <Pressable
              onPress={() => setMenu({ target: author, isSelf: author.id === state.viewer.id, following: followingAuthor, reportTarget: { kind: 'take', id: take.id } })}
              accessibilityRole="button"
              accessibilityLabel="More actions"
              hitSlop={8}
              style={styles.moreBtn}
            >
              <MoreIcon size={20} color={ink.tertiary} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.authorRow}>
            <Avatar name={author.name} tint={author.tint} size={36} />
            <View style={styles.authorText}>
              <Text allowFontScaling={false} style={styles.handle}>
                {author.name} · {HOOD_LABEL[take.hood]}
              </Text>
              <Text allowFontScaling={false} style={styles.meta}>@{author.handle}</Text>
            </View>
          </View>

          <Text allowFontScaling style={styles.takeText}>{take.text}</Text>
          {take.media ? <TakeMedia media={take.media} /> : null}

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
          />

          <View style={styles.threadHead}>
            <Text allowFontScaling={false} style={styles.threadTitle}>{comments.length} replies</Text>
            <SegmentedTabs<CommentSort> value={sort} items={SORTS} onChange={setSort} label="Sort replies" />
          </View>

          {nodes.length === 0 ? (
            <Text allowFontScaling={false} style={styles.empty}>No rebuttals yet — drop the first one.</Text>
          ) : (
            <CommentThread nodes={nodes} onUpvote={upvote} onReply={reply} onClash={clashFromComment} onMore={more} />
          )}
        </ScrollView>

        <View style={styles.inputBar}>
          <RebuttalInput takeId={take.id} parentId={replyTo?.comment.id} replyingTo={replyTo?.handle} onDone={() => setReplyTo(null)} />
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
            void fetchFollowState(author.id).then((fs) => setFollowingAuthor(fs.following)).catch(() => undefined);
          }
        }}
      />
      <ClashModeSheet
        visible={clashComment !== null}
        onClose={() => setClashComment(null)}
        onChoose={(mode) => void startChosenClash(mode)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  content: { paddingHorizontal: space.md, gap: space.md },
  missing: { paddingHorizontal: space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  moreBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  eyebrow: { ...typeScale.caption, color: ink.tertiary },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  authorText: { flex: 1, gap: 1 },
  handle: { ...typeScale.label, color: ink.primary, fontWeight: '600' },
  meta: { ...typeScale.meta, color: ink.tertiary },
  takeText: { fontSize: 17, lineHeight: 24, fontWeight: '500', color: ink.primary },
  threadHead: { gap: space.sm, paddingTop: space.sm },
  threadTitle: { ...typeScale.section, color: ink.primary, fontSize: 17 },
  empty: { ...typeScale.meta, color: ink.tertiary, paddingVertical: space.lg },
  inputBar: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: color.bg,
  },
});
