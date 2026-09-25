import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChallengerComment, User } from '../../store/types';
import { ink, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';

export interface TopChallengerSnippetProps {
  topComment: ChallengerComment | undefined;
  author: User | undefined;
  onPress: () => void;
}

/** Quiet preview of the top rebuttal. Null when no comments. */
export function TopChallengerSnippet({
  topComment,
  author,
  onPress,
}: TopChallengerSnippetProps): React.JSX.Element | null {
  if (!topComment) return null;
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Top rebuttal by ${author?.handle ?? 'challenger'}. Open replies.`}
      style={styles.card}
    >
      <View style={styles.main}>
        <View style={styles.header}>
          <Text allowFontScaling={false} style={styles.eyebrow}>
            {'\u2694\uFE0F TOP REBUTTAL'}
          </Text>
          {author ? (
            <Text allowFontScaling={false} style={styles.handle} numberOfLines={1}>
              @{author.handle}
            </Text>
          ) : null}
        </View>
        <Text allowFontScaling={false} style={styles.text} numberOfLines={2}>
          {topComment.text}
        </Text>
      </View>
      <View style={styles.pill}>
        <Text allowFontScaling={false} style={styles.pillText}>
          {'\u25B2 '}{compact(topComment.upvotes)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#141418',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  main: { flex: 1, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { ...typeScale.caption, fontSize: 10, letterSpacing: 0.8, color: ink.tertiary },
  handle: { ...typeScale.caption, fontSize: 11, color: ink.tertiary, flexShrink: 1 },
  text: { fontSize: 14, lineHeight: 19, color: ink.primary, fontWeight: '500' },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    flexShrink: 0,
  },
  pillText: { ...typeScale.data, fontSize: 11, color: ink.primary },
});
