import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CommunityPostCard } from '../../../services/vaultCommunityMappers';
import { communityCoverUrl } from '../../../services/vaultCommunityService';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { communityReplyCountLabel } from '../../../utils/vaultCommunityFeed';
import { tap as hapticTap } from '../../../utils/haptics';
import { CommentIcon, MoreIcon } from '../../shared/icons';
import { CommunityIdentityRow } from './CommunityIdentityRow';

export interface CommunityPostCardProps {
  post: CommunityPostCard;
  onToggleReplies?: () => void;
  onMore?: () => void;
  onOpenProfile?: () => void;
  /** Replies area, rendered by the parent when expanded. */
  children?: React.ReactNode;
}

/** A conversation card — premium social, never a Reddit row and with no voting. */
export function CommunityPostCard({
  post,
  onToggleReplies,
  onMore,
  onOpenProfile,
  children,
}: CommunityPostCardProps): React.JSX.Element {
  const t = useThemeColors();
  const mediaUrl = communityCoverUrl(post.media);

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <CommunityIdentityRow
        identity={post.identity}
        createdAt={post.createdAt}
        onPressProfile={onOpenProfile}
      />
      <Text allowFontScaling={false} style={[styles.body, { color: t.textPrimary }]}>
        {post.body}
      </Text>
      {mediaUrl ? (
        <Image source={{ uri: mediaUrl }} style={styles.image} resizeMode="cover" />
      ) : null}
      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            hapticTap();
            onToggleReplies?.();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={communityReplyCountLabel(post.replyCount)}
          style={styles.action}
        >
          <CommentIcon size={16} color={t.textSecondary} strokeWidth={2} />
          <Text allowFontScaling={false} style={[styles.actionLabel, { color: t.textSecondary }]}>
            {communityReplyCountLabel(post.replyCount)}
          </Text>
        </Pressable>
        {onMore ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onMore();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Post options"
            style={styles.action}
          >
            <MoreIcon size={18} color={t.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { ...typeScale.body, fontSize: 15, lineHeight: 22 },
  image: { width: '100%', height: 200, borderRadius: radius.lg },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionLabel: { ...typeScale.meta, fontSize: 12, fontWeight: '600' },
});
