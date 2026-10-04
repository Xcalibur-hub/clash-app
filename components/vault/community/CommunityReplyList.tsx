import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CommunityReplyCard } from '../../../services/vaultCommunityMappers';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';
import { MoreIcon } from '../../shared/icons';
import { CommunityIdentityRow } from './CommunityIdentityRow';

export interface CommunityReplyListProps {
  replies: readonly CommunityReplyCard[];
  loading?: boolean;
  onReply?: (reply: CommunityReplyCard) => void;
  onMore?: (reply: CommunityReplyCard) => void;
  onOpenProfile?: (reply: CommunityReplyCard) => void;
}

/** Threaded replies — one level deep. Compact rows, no vote controls. */
export function CommunityReplyList({
  replies,
  loading = false,
  onReply,
  onMore,
  onOpenProfile,
}: CommunityReplyListProps): React.JSX.Element {
  const t = useThemeColors();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.textMuted} />
      </View>
    );
  }

  if (replies.length === 0) {
    return (
      <Text allowFontScaling={false} style={[styles.empty, { color: t.textMuted }]}>
        No replies yet.
      </Text>
    );
  }

  return (
    <View style={[styles.list, { borderColor: t.border }]}>
      {replies.map((reply) => (
        <View key={reply.id} style={styles.reply}>
          <CommunityIdentityRow
            identity={reply.identity}
            createdAt={reply.createdAt}
            onPressProfile={onOpenProfile ? () => onOpenProfile(reply) : undefined}
          />
          <Text allowFontScaling={false} style={[styles.body, { color: t.textSecondary }]}>
            {reply.body}
          </Text>
          <View style={styles.actions}>
            {onReply ? (
              <Pressable
                onPress={() => {
                  hapticTap();
                  onReply(reply);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Reply"
              >
                <Text allowFontScaling={false} style={[styles.actionLabel, { color: t.textSecondary }]}>
                  Reply
                </Text>
              </Pressable>
            ) : null}
            {onMore ? (
              <Pressable
                onPress={() => {
                  hapticTap();
                  onMore(reply);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Reply options"
              >
                <MoreIcon size={16} color={t.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.sm,
    gap: space.md,
  },
  reply: { gap: 6, paddingLeft: space.xs },
  body: { ...typeScale.body, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  actionLabel: { ...typeScale.meta, fontSize: 12, fontWeight: '600' },
  center: { paddingVertical: space.md, alignItems: 'center' },
  empty: { ...typeScale.meta, paddingVertical: space.sm },
});
