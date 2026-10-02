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

export interface CommentThreadProps {
  nodes: CommentNode[];
  takeAuthorId?: string;
  onUpvote: (comment: ChallengerComment) => void;
  onReply: (comment: ChallengerComment) => void;
  onClash: (comment: ChallengerComment) => void;
  onMore: (comment: ChallengerComment) => void;
}

/** Threaded conversation — indentation + thread line, no giant cards. */
export function CommentThread({
  nodes,
  takeAuthorId,
  onUpvote,
  onReply,
  onClash,
  onMore,
}: CommentThreadProps): React.JSX.Element {
  return (
    <View style={styles.list}>
      {nodes.map((node) => (
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
  const comment = node.comment;
  const author = selectAuthor(state, comment.authorId);
  const upvoted = state.upvotedCommentIds.includes(comment.id);
  const isViewer = comment.authorId === state.viewer.id;
  const isOp = takeAuthorId !== undefined && comment.authorId === takeAuthorId;
  const parentRemoved = Boolean(comment.parentId) && !state.comments.some((c) => c.id === comment.parentId);
  // Cap indent so nested media stays usable on small screens.
  const step = depth >= 3 ? 8 : 12;
  const indent = Math.min(depth, 4) * step;
  const hasText = Boolean(comment.text.trim());

  return (
    <View>
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
          {
            marginLeft: indent,
            borderLeftWidth: depth > 0 ? StyleSheet.hairlineWidth * 2 : 0,
            borderLeftColor: depth > 0 ? t.borderStrong : 'transparent',
            paddingLeft: depth > 0 ? space.sm : 0,
          },
        ]}
      >
        <Avatar name={author?.name ?? '?'} tint={author?.tint ?? '#888'} size={depth === 0 ? 30 : 24} />
        <View style={styles.main}>
          <View style={styles.meta}>
            <Text allowFontScaling={false} style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>
              {author?.name ?? 'ghost'}
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
                  CLASH
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
                  {collapsed ? `Show ${node.children.length}` : 'Hide'}
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
        : node.children.map((child) => (
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
    </View>
  );
});

const styles = StyleSheet.create({
  list: { gap: space.md },
  item: {
    flexDirection: 'row',
    gap: space.sm,
    paddingVertical: 4,
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
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
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
    letterSpacing: 0.4,
  },
  spacer: { flex: 1 },
  more: { padding: 2 },
  removedNote: { ...typeScale.caption, fontSize: 10, paddingTop: space.xs },
});
