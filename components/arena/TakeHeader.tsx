import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { HOOD_LABEL } from '../../data/hoods';
import type { Take, User } from '../../store';
import { ink, space, typeScale } from '../../theme';
import { timeAgo } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { MoreIcon } from '../shared/icons';

export interface TakeHeaderProps {
  author: User;
  take: Take;
  isViewer: boolean;
  onMore: () => void;
}

/**
 * Author row: avatar, name · Hood, then @handle · relative time. A single
 * overflow menu on the right — no oversized follow button per post.
 */
export function TakeHeader({ author, take, isViewer, onMore }: TakeHeaderProps): React.JSX.Element {
  const router = useRouter();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => {
          hapticTap();
          router.push(`/profile/${author.id}`);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Open ${author.name}'s profile`}
        hitSlop={6}
      >
        <Avatar name={author.name} tint={author.tint} size={34} />
      </Pressable>
      <View style={styles.names}>
        <Text allowFontScaling={false} style={styles.primary} numberOfLines={1}>
          {author.name}
          <Text
            style={styles.hood}
            suppressHighlighting
            onPress={() => router.push(`/hood/${take.hood}`)}
          >
            {'  · '}{HOOD_LABEL[take.hood]}
          </Text>
        </Text>
        <Text allowFontScaling={false} style={styles.secondary} numberOfLines={1}>
          @{author.handle} · {timeAgo(take.createdAt)}
          {isViewer ? ' · You' : ''}
        </Text>
      </View>
      <Pressable
        onPress={() => {
          hapticTap();
          onMore();
        }}
        accessibilityRole="button"
        accessibilityLabel="More take actions"
        hitSlop={8}
        style={styles.more}
      >
        <MoreIcon size={20} color={ink.tertiary} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  names: { flex: 1, gap: 1 },
  primary: { ...typeScale.label, color: ink.primary, fontWeight: '600' },
  hood: { color: ink.secondary, fontWeight: '600' },
  secondary: { ...typeScale.meta, color: ink.tertiary, fontSize: 13 },
  more: { padding: space.xs, marginRight: -space.xs },
});
