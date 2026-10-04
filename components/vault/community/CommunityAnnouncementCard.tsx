import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CommunityPostCard } from '../../../services/vaultCommunityMappers';
import { communityCoverUrl } from '../../../services/vaultCommunityService';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { timeAgo } from '../../../utils/format';
import { tap as hapticTap } from '../../../utils/haptics';
import { MoreIcon } from '../../shared/icons';

export interface CommunityAnnouncementCardProps {
  post: CommunityPostCard;
  creatorName: string;
  onMore?: () => void;
}

/** Pinned creator announcement — editorial, clearly distinct from discussion. */
export function CommunityAnnouncementCard({
  post,
  creatorName,
  onMore,
}: CommunityAnnouncementCardProps): React.JSX.Element {
  const t = useThemeColors();
  const mediaUrl = communityCoverUrl(post.media);

  return (
    <View style={[styles.card, { backgroundColor: t.surfaceElevated, borderColor: t.border }]}>
      <Text allowFontScaling={false} style={[styles.kicker, { color: t.textMuted }]}>
        FROM {creatorName.toUpperCase()}
      </Text>
      <Text allowFontScaling={false} style={[styles.body, { color: t.textPrimary }]}>
        {post.body}
      </Text>
      {mediaUrl ? (
        <Image source={{ uri: mediaUrl }} style={styles.image} resizeMode="cover" />
      ) : null}
      <View style={styles.footer}>
        <Text allowFontScaling={false} style={[styles.time, { color: t.textMuted }]}>
          {timeAgo(post.createdAt)}
        </Text>
        {onMore ? (
          <Pressable
            onPress={() => {
              hapticTap();
              onMore();
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Announcement options"
          >
            <MoreIcon size={18} color={t.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  kicker: { ...typeScale.caption, fontWeight: '800', letterSpacing: 1 },
  body: { ...typeScale.takeText, fontSize: 17, lineHeight: 25 },
  image: { width: '100%', height: 200, borderRadius: radius.lg, marginTop: space.xs },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { ...typeScale.meta, fontSize: 12 },
});
