import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChallengerComment, User } from '../../store';
import { ink, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { CommentIcon } from '../shared/icons';

export interface TopRebuttalPreviewProps {
  comment: ChallengerComment | undefined;
  author: User | undefined;
  onOpen: () => void;
}

/** Quiet preview of the leading rebuttal — a compact inset row, not a nested card. */
export function TopRebuttalPreview({
  comment,
  author,
  onOpen,
}: TopRebuttalPreviewProps): React.JSX.Element | null {
  if (!comment) return null;
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Top rebuttal by @${author?.handle ?? 'challenger'}`}
      style={styles.wrap}
    >
      <CommentIcon size={14} color={ink.tertiary} strokeWidth={2.2} />
      <View style={styles.body}>
        <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
          @{author?.handle ?? 'challenger'} · {compact(comment.upvotes)}
        </Text>
        <Text allowFontScaling={false} style={styles.quote} numberOfLines={2}>
          {comment.text}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
    paddingLeft: space.sm,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.12)',
  },
  body: { flex: 1, gap: 2 },
  meta: { ...typeScale.meta, fontSize: 12, color: ink.tertiary },
  quote: { fontSize: 14, lineHeight: 19, color: ink.secondary, fontWeight: '400' },
});
