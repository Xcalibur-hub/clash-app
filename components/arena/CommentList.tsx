import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../shared/Avatar';
import { CrownIcon } from '../shared/icons';
import { selectAuthor, showNotice, syncCommentUpvote, toggleCommentUpvote, useClash } from '../../store';
import { toggleUpvote } from '../../services/apiService';
import { errorText } from '../../services/supabaseClient';
import { accent, ink, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import type { RepliesSort } from './RepliesSheet';

function timeAgo(createdAt: number, now: number): string {
  const mins = Math.max(1, Math.round((now - createdAt) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Sorted comment rows with upvote toggle + reigning crown. Max 150 lines. */
export function CommentList({
  takeId,
  sort,
  avatarSize = 28,
}: {
  takeId: string;
  sort: RepliesSort;
  avatarSize?: number;
}): React.JSX.Element {
  const { state, dispatch } = useClash();
  const now = Date.now();

  const commentsRef = React.useRef(state.comments);
  React.useEffect(() => {
    commentsRef.current = state.comments;
  });

  // Instant feedback first, server truth after: the optimistic flip lands the
  // tap, then the RPC tally reconciles it — or rolls it back on failure. The
  // rollback baseline is read from the mirrored comments, not the tapped row,
  // so a concurrent server tally cannot poison the revert.
  const toggleVote = React.useCallback(
    async (commentId: string): Promise<void> => {
      const baseline = commentsRef.current.find((item) => item.id === commentId);
      const wasUpvoted = state.upvotedCommentIds.includes(commentId);
      hapticTap();
      dispatch(toggleCommentUpvote(commentId));
      try {
        const result = await toggleUpvote(commentId, state.viewer.id);
        dispatch(syncCommentUpvote(result.commentId, result.upvoted, result.upvotesCount));
      } catch (error) {
        dispatch(syncCommentUpvote(commentId, wasUpvoted, baseline?.upvotes ?? 0));
        dispatch(showNotice(errorText(error)));
      }
    },
    [dispatch, state.upvotedCommentIds, state.viewer.id],
  );

  const sorted = React.useMemo(() => {
    const list = state.comments.filter((c) => c.takeId === takeId);
    list.sort((a, b) => (sort === 'top' ? b.upvotes - a.upvotes : b.createdAt - a.createdAt));
    return list;
  }, [state.comments, takeId, sort]);

  return (
    <View style={styles.list}>
      {sorted.map((item, index) => {
        const user = selectAuthor(state, item.authorId);
        const upvoted = state.upvotedCommentIds.includes(item.id);
        const reigning = sort === 'top' && index === 0;
        return (
          <View key={item.id} style={styles.row}>
            <Avatar name={user?.name ?? '?'} tint={user?.tint ?? '#888'} size={avatarSize} />
            <View style={styles.main}>
              <View style={styles.meta}>
                <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>
                  @{user?.handle ?? 'ghost'} · {timeAgo(item.createdAt, now)}
                </Text>
                {reigning ? (
                  <View style={styles.crown}>
                    <CrownIcon size={11} color={accent.gold} strokeWidth={2.4} />
                    <Text allowFontScaling={false} style={styles.crownText}>Reigning Take B</Text>
                  </View>
                ) : null}
              </View>
              <Text allowFontScaling={false} style={styles.body}>{item.text}</Text>
            </View>
            <Pressable
              onPress={() => {
                void toggleVote(item.id);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: upvoted }}
              accessibilityLabel={`Upvote rebuttal, ${item.upvotes} upvotes`}
              style={[styles.vote, upvoted && styles.voteOn]}
            >
              <Text allowFontScaling={false} style={[styles.voteText, upvoted && styles.voteTextOn]}>
                {'\u25B2 '}{compact(item.upvotes)}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 2, maxHeight: 300 },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 10, alignItems: 'flex-start' },
  main: { flex: 1, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  handle: { ...typeScale.caption, fontSize: 10, color: ink.tertiary, flexShrink: 1 },
  crown: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(255,200,97,0.14)', borderWidth: 1, borderColor: 'rgba(255,200,97,0.4)' },
  crownText: { ...typeScale.data, fontSize: 9, color: accent.gold },
  body: { fontSize: 14, lineHeight: 20, color: ink.primary },
  vote: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)' },
  voteOn: { borderColor: 'rgba(255,200,97,0.5)', backgroundColor: 'rgba(255,200,97,0.14)' },
  voteText: { ...typeScale.data, fontSize: 11, color: ink.secondary },
  voteTextOn: { color: accent.gold },
});
