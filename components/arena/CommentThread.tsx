import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChallengerComment } from '../../store';
import { selectAuthor, useClash, type CommentNode } from '../../store';
import { ink, space, typeScale } from '../../theme';
import { compact, timeAgo } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { ArenaIcon, ArrowBigUpIcon, CommentIcon, MoreIcon } from '../shared/icons';

export interface CommentThreadProps {
  nodes: CommentNode[];
  onUpvote: (comment: ChallengerComment) => void;
  onReply: (comment: ChallengerComment) => void;
  onClash: (comment: ChallengerComment) => void;
  onMore: (comment: ChallengerComment) => void;
}

/** Threaded rebuttal list — recursive, with per-branch collapse and depth capping. */
export function CommentThread({ nodes, onUpvote, onReply, onClash, onMore }: CommentThreadProps): React.JSX.Element {
  return (
    <View style={styles.list}>
      {nodes.map((node) => (
        <CommentItem key={node.comment.id} node={node} depth={0} onUpvote={onUpvote} onReply={onReply} onClash={onClash} onMore={onMore} />
      ))}
    </View>
  );
}

interface CommentItemProps {
  node: CommentNode;
  depth: number;
  onUpvote: (comment: ChallengerComment) => void;
  onReply: (comment: ChallengerComment) => void;
  onClash: (comment: ChallengerComment) => void;
  onMore: (comment: ChallengerComment) => void;
}

function CommentItem({ node, depth, onUpvote, onReply, onClash, onMore }: CommentItemProps): React.JSX.Element {
  const { state } = useClash();
  const [collapsed, setCollapsed] = React.useState(false);
  const comment = node.comment;
  const author = selectAuthor(state, comment.authorId);
  const upvoted = state.upvotedCommentIds.includes(comment.id);
  const isViewer = comment.authorId === state.viewer.id;
  const parentRemoved = Boolean(comment.parentId) && !state.comments.some((c) => c.id === comment.parentId);
  const indent = Math.min(depth, 4) * 14;

  return (
    <View>
      {parentRemoved ? (
        <Text allowFontScaling={false} style={[styles.removedNote, { marginLeft: indent + space.sm }]}>
          {'\u21B3 [removed]'}
        </Text>
      ) : null}
      <View style={[styles.item, { marginLeft: indent, borderLeftWidth: depth > 0 ? 1 : 0 }]}>
        <Avatar name={author?.name ?? '?'} tint={author?.tint ?? '#888'} size={28} />
        <View style={styles.main}>
          <View style={styles.meta}>
            <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>
              {author?.name ?? 'ghost'} · @{author?.handle ?? 'ghost'} · {timeAgo(comment.createdAt)}
            </Text>
            {isViewer ? <Text allowFontScaling={false} style={styles.you}>You</Text> : null}
          </View>
          <Text allowFontScaling style={styles.body}>
            {comment.text}
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() => { hapticTap(); onUpvote(comment); }}
              accessibilityRole="button"
              accessibilityState={{ selected: upvoted }}
              accessibilityLabel={`Upvote reply, ${comment.upvotes} upvotes`}
              style={styles.action}
            >
              <ArrowBigUpIcon size={16} color={upvoted ? ink.primary : ink.tertiary} strokeWidth={upvoted ? 2.4 : 2} />
              <Text allowFontScaling={false} style={[styles.actionText, upvoted && styles.actionTextOn]}>
                {compact(comment.upvotes)}
              </Text>
            </Pressable>
            <Pressable onPress={() => { hapticTap(); onReply(comment); }} accessibilityRole="button" accessibilityLabel="Reply" style={styles.action}>
              <CommentIcon size={15} color={ink.tertiary} strokeWidth={2} />
              <Text allowFontScaling={false} style={styles.actionText}>Reply</Text>
            </Pressable>
            {isViewer ? (
              <Pressable onPress={() => { hapticTap(); onClash(comment); }} accessibilityRole="button" accessibilityLabel="Challenge with this rebuttal" style={styles.clash}>
                <ArenaIcon size={13} color={ink.primary} strokeWidth={2.4} />
                <Text allowFontScaling={false} style={styles.clashText}>CLASH</Text>
              </Pressable>
            ) : null}
            {node.children.length > 0 ? (
              <Pressable onPress={() => { hapticTap(); setCollapsed((c) => !c); }} accessibilityRole="button" accessibilityState={{ expanded: !collapsed }} accessibilityLabel={collapsed ? 'Expand replies' : 'Collapse replies'} style={styles.action}>
                <Text allowFontScaling={false} style={styles.actionText}>
                  {collapsed ? `[+] ${node.children.length}` : 'collapse'}
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.spacer} />
            <Pressable onPress={() => { hapticTap(); onMore(comment); }} accessibilityRole="button" accessibilityLabel="More actions" hitSlop={8} style={styles.more}>
              <MoreIcon size={16} color={ink.tertiary} strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>
      </View>

      {collapsed ? null : node.children.map((child) => (
        <CommentItem key={child.comment.id} node={child} depth={depth + 1} onUpvote={onUpvote} onReply={onReply} onClash={onClash} onMore={onMore} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  item: {
    flexDirection: 'row',
    gap: space.sm,
    paddingLeft: space.sm,
    borderLeftColor: 'rgba(255,255,255,0.10)',
  },
  main: { flex: 1, gap: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  handle: { ...typeScale.caption, fontSize: 11, color: ink.tertiary, flexShrink: 1 },
  you: { ...typeScale.caption, fontSize: 10, color: ink.secondary },
  body: { fontSize: 14, lineHeight: 20, color: ink.primary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap', paddingTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  actionText: { ...typeScale.meta, fontSize: 12, color: ink.tertiary },
  actionTextOn: { color: ink.primary },
  clash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  clashText: { ...typeScale.caption, fontSize: 10, fontWeight: '700', letterSpacing: 0.3, color: ink.primary },
  spacer: { flex: 1 },
  more: { padding: 2 },
  removedNote: { ...typeScale.caption, fontSize: 10, color: ink.quaternary, paddingTop: space.xs },
});
