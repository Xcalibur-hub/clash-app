import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../shared/Avatar';
import { CrownIcon } from '../shared/icons';
import { selectAuthor, toggleCommentUpvote, useClash } from '../../store';
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
export function CommentList({ takeId, sort }: { takeId: string; sort: RepliesSort }): React.JSX.Element {
  const { state, dispatch } = useClash();
  const now = Date.now();
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
            <Avatar name={user?.name ?? '?'} tint={user?.tint ?? '#888'} size={28} />
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
              onPress={() => { hapticTap(); dispatch(toggleCommentUpvote(item.id)); }}
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
