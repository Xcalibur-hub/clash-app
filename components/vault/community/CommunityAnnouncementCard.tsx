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

/** A pinned creator note — the room's editorial headline, not a chat bubble. */
export function CommunityAnnouncementCard({
  post,
  creatorName,
  onMore,
}: CommunityAnnouncementCardProps): React.JSX.Element {
  const t = useThemeColors();
  const mediaUrl = communityCoverUrl(post.media);
  const firstName = creatorName.trim().split(' ')[0] || creatorName;

  return (
    <View style={[styles.note, { borderTopColor: t.textPrimary }]}>
      <View style={styles.head}>
        <Text allowFontScaling={false} style={[styles.pin, { color: t.textMuted }]}>
          {`PINNED · FROM ${firstName.toUpperCase()}`}
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
      <Text allowFontScaling={false} style={[styles.body, { color: t.textPrimary }]}>
        {post.body}
      </Text>
      {mediaUrl ? <Image source={{ uri: mediaUrl }} style={styles.image} resizeMode="cover" /> : null}
      <Text allowFontScaling={false} style={[styles.time, { color: t.textMuted }]}>
        {timeAgo(post.createdAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { gap: space.sm, paddingTop: space.md, borderTopWidth: 2 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pin: { ...typeScale.caption, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  body: { ...typeScale.takeText, fontSize: 19, lineHeight: 27, letterSpacing: -0.3 },
  image: { width: '100%', height: 220, borderRadius: radius.md, marginTop: space.xs },
  time: { ...typeScale.caption, fontSize: 11, letterSpacing: 0.3 },
});