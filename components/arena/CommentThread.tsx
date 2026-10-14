import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChallengerComment } from '../../store';
import { selectAuthor, useClash, type CommentNode } from '../../store';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { compact, timeAgo } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { ArenaIcon, ArrowBigUpIcon, CommentIcon, MoreIcon } from '../shared/icons';
import { PressableScale } from '../shared/PressableScale';
import { CommentMedia } from './CommentMedia';

const ROOT_PAGE_SIZE = 8;
const REPLY_PAGE_SIZE = 4;

export interface CommentThreadProps {
  nodes: CommentNode[];
  takeAuthorId?: string;
  onUpvote: (comment: ChallengerComment) => void;
  onReply: (comment: ChallengerComment) => void;
  onClash: (comment: ChallengerComment) => void;
  onMore: (comment: ChallengerComment) => void;
}

/** Immersive conversation — top-level replies stay open; nested replies float as soft plates. */
export function CommentThread({
  nodes,
  takeAuthorId,
  onUpvote,
  onReply,
  onClash,
  onMore,
}: CommentThreadProps): React.JSX.Element {
  const t = useThemeColors();
  const [visibleCount, setVisibleCount] = React.useState(ROOT_PAGE_SIZE);
  const visible = nodes.slice(0, visibleCount);
  const remaining = nodes.length - visible.length;
  return (
    <View style={styles.list}>
      {visible.map((node) => (
        <CommentItem
          key={node.comment.id}
          node={node}
          depth={0}
          takeAuthorId={takeAuthorId}
          onUpvote={onUpvote}
          onReply={onReply}
          onClash={onClash}
          onMore={onMore}
        />
      ))}
      {remaining > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Show more discussion threads, ${remaining} remaining`}
          onPress={() => { hapticTap(); setVisibleCount((count) => count + ROOT_PAGE_SIZE); }}
          style={[styles.loadMore, { borderColor: t.borderStrong, backgroundColor: t.surfaceElevated }]}>
          <Text style={[styles.loadMoreText, { color: t.textPrimary }]}>
            Show {Math.min(ROOT_PAGE_SIZE, remaining)} more conversations ↓
          </Text>
          <Text style={[styles.loadMoreHint, { color: t.textMuted }]}>
            {remaining} threads remaining
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface CommentItemProps {
  node: CommentNode;
  depth: number;
  takeAuthorId?: string;
  onUpvote: (comment: ChallengerComment) => void;
  onReply: (comment: ChallengerComment) => void;
  onClash: (comment: ChallengerComment) => void;
  onMore: (comment: ChallengerComment) => void;
}

const CommentItem = React.memo(function CommentItem({
  node,
  depth,
  takeAuthorId,
  onUpvote,
  onReply,
  onClash,
  onMore,
}: CommentItemProps): React.JSX.Element {
  const { state } = useClash();
  const t = useThemeColors();
  const [collapsed, setCollapsed] = React.useState(false);
  const [visibleReplies, setVisibleReplies] = React.useState(REPLY_PAGE_SIZE);
  const comment = node.comment;
  const author = selectAuthor(state, comment.authorId);
  const upvoted = state.upvotedCommentIds.includes(comment.id);
  const isViewer = comment.authorId === state.viewer.id;
  const isOp = takeAuthorId !== undefined && comment.authorId === takeAuthorId;
  const parentRemoved = Boolean(comment.parentId) && !state.comments.some((c) => c.id === comment.parentId);
  // Cap indent so nested media stays usable on small screens.
  const step = depth >= 3 ? 10 : 14;
  const indent = Math.min(depth, 4) * step;
  const hasText = Boolean(comment.text.trim());
  const nested = depth > 0;
  const parent = comment.parentId ? state.comments.find((c) => c.id === comment.parentId) : undefined;
  const parentAuthor = parent ? selectAuthor(state, parent.authorId) : undefined;
  const nestedCount = React.useMemo(() => {
    const count = (branch: CommentNode): number =>
      branch.children.reduce((sum, child) => sum + 1 + count(child), 0);
    return count(node);
  }, [node]);
  const handle = author?.handle ? `@${author.handle}` : '@ghost';

  return (
    <View style={depth === 0 ? styles.rootBranch : undefined}>
      {parentRemoved ? (
        <Text
          allowFontScaling={false}
          style={[styles.removedNote, { marginLeft: indent + space.sm, color: t.textMuted }]}
        >
          {'\u21B3 [removed]'}
        </Text>
      ) : null}
      <View
        style={[
          styles.item,
          nested && styles.itemNested,
          nested && {
            marginLeft: indent,
            backgroundColor: 'transparent',
            borderLeftColor: t.scheme === 'dark' ? '#A98ACC' : '#A882C4',
            borderColor: t.border,
          },
          !nested && {
            marginLeft: 0,
            backgroundColor: t.scheme === 'dark' ? '#1E1A24' : '#FFF9F3',
          },
        ]}
      >
        <Avatar name={author?.name ?? '?'} tint={author?.tint ?? '#888'} size={nested ? 24 : 30} />
        <View style={styles.main}>
          <View style={styles.meta}>
            <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
              {handle}
            </Text>
            {isOp ? (
              <View style={[styles.opBadge, { backgroundColor: t.surfaceMuted }]}>
                <Text allowFontScaling={false} style={[styles.opText, { color: t.textPrimary }]}>
                  OP
                </Text>
              </View>
            ) : null}
            {isViewer ? (
              <Text allowFontScaling={false} style={[styles.you, { color: t.textSecondary }]}>
                You
              </Text>
            ) : null}
            <Text allowFontScaling={false} style={[styles.handle, { color: t.textMuted }]} numberOfLines={1}>
              · {timeAgo(comment.createdAt)}
            </Text>
          </View>
          {nested && parentAuthor ? (
            <Text style={[styles.replyContext, { color: t.scheme === 'dark' ? '#C9AEDF' : '#8A598E' }]}
              numberOfLines={1}>
              ↳ replying to @{parentAuthor.handle}
            </Text>
          ) : null}
          {comment.media ? <CommentMedia media={comment.media} compact={depth >= 2} /> : null}
          {hasText ? (
            <Text allowFontScaling style={[styles.body, { color: t.textPrimary }]}>
              {comment.text}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                hapticTap();
                onUpvote(comment);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: upvoted }}
              accessibilityLabel={`Upvote reply, ${comment.upvotes} upvotes`}
              style={styles.action}
            >
              <ArrowBigUpIcon size={15} color={upvoted ? t.textPrimary : t.textMuted} strokeWidth={upvoted ? 2.4 : 2} />
              <Text
                allowFontScaling={false}
                style={[styles.actionText, { color: upvoted ? t.textPrimary : t.textMuted }]}
              >
                {compact(comment.upvotes)}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                hapticTap();
                onReply(comment);
              }}
              accessibilityRole="button"
              accessibilityLabel="Reply"
              style={styles.action}
            >
              <CommentIcon size={14} color={t.textMuted} strokeWidth={2} />
              <Text allowFontScaling={false} style={[styles.actionText, { color: t.textMuted }]}>
                Reply
              </Text>
            </Pressable>
            {isViewer ? (
              <PressableScale
                onPress={() => {
                  hapticTap();
                  onClash(comment);
                }}
                accessibilityRole="button"
                accessibilityLabel="Challenge with this rebuttal"
                style={[styles.clash, { backgroundColor: t.clashFill }]}
              >
                <ArenaIcon size={11} color={t.clashText} strokeWidth={2.6} />
                <Text allowFontScaling={false} style={[styles.clashText, { color: t.clashText }]}>
                  Challenge
                </Text>
              </PressableScale>
            ) : null}
            {node.children.length > 0 ? (
              <Pressable
                onPress={() => {
                  hapticTap();
                  setCollapsed((c) => !c);
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed }}
                accessibilityLabel={collapsed ? 'Expand replies' : 'Collapse replies'}
                style={styles.action}
              >
                <Text allowFontScaling={false} style={[styles.collapseText, { color: t.textSecondary }]}>
                  {collapsed ? `Show ${nestedCount} ${nestedCount === 1 ? 'reply' : 'replies'} ↓` : 'Collapse thread ↑'}
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.spacer} />
            <Pressable
              onPress={() => {
                hapticTap();
                onMore(comment);
              }}
              accessibilityRole="button"
              accessibilityLabel="More actions"
              hitSlop={8}
              style={styles.more}
            >
              <MoreIcon size={15} color={t.textMuted} strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>
      </View>

      {collapsed
        ? null
        : node.children.length > 0 ? (
          <View style={[
            styles.branchChildren,
            { marginLeft: Math.min(depth, 3) * 4 + 16, borderLeftColor: t.scheme === 'dark' ? '#665376' : '#D1BDD8' },
          ]}>
          {node.children.slice(0, visibleReplies).map((child) => (
            <CommentItem
              key={child.comment.id}
              node={child}
              depth={depth + 1}
              takeAuthorId={takeAuthorId}
              onUpvote={onUpvote}
              onReply={onReply}
              onClash={onClash}
              onMore={onMore}
            />
          ))}
          {node.children.length > visibleReplies ? (
            <Pressable accessibilityRole="button"
              accessibilityLabel={`Show more replies, ${node.children.length - visibleReplies} remaining`}
              style={styles.moreReplies}
              onPress={() => { hapticTap(); setVisibleReplies((count) => count + REPLY_PAGE_SIZE); }}>
              <Text style={[styles.moreRepliesText, { color: t.scheme === 'dark' ? '#D6B9FA' : '#8052A5' }]}>
                ↳ View {Math.min(REPLY_PAGE_SIZE, node.children.length - visibleReplies)} more replies
              </Text>
            </Pressable>
          ) : null}
          </View>
        ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  list: { gap: space.md + 2 },
  loadMore: { minHeight: 66, borderRadius: 18, borderWidth: 1, padding: 15, alignItems: 'center', justifyContent: 'center', gap: 4 },
  loadMoreText: { fontSize: 14, fontWeight: '800' },
  loadMoreHint: { fontSize: 11, fontWeight: '600' },
  moreReplies: { minHeight: 42, justifyContent: 'center', paddingLeft: 12 },
  moreRepliesText: { fontSize: 12, fontWeight: '800' },
  rootBranch: { gap: 4 },
  branchChildren: { borderLeftWidth: 2, marginTop: 3, paddingLeft: 4, gap: 6 },
  replyContext: { fontSize: 11, fontWeight: '700', letterSpacing: 0.1 },
  item: {
    flexDirection: 'row',
    gap: space.sm,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  itemNested: {
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.sm,
    borderWidth: 0,
    borderLeftWidth: 3,
    borderRadius: 0,
    marginTop: 2,
  },
  main: { flex: 1, gap: 6, minWidth: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  name: { ...typeScale.label, fontSize: 13, fontWeight: '700' },
  handle: { ...typeScale.caption, fontSize: 11, flexShrink: 1 },
  you: { ...typeScale.caption, fontSize: 10, fontWeight: '600' },
  opBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  opText: { ...typeScale.caption, fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  body: { fontSize: 15, lineHeight: 23, fontWeight: '400' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    flexWrap: 'wrap',
    paddingTop: 2,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 30 },
  actionText: { ...typeScale.meta, fontSize: 12 },
  collapseText: { ...typeScale.meta, fontSize: 12, fontWeight: '600' },
  clash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  clashText: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  spacer: { flex: 1 },
  more: { padding: 2 },
  removedNote: { ...typeScale.caption, fontSize: 10, paddingTop: space.xs },
});
