import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { HOOD_LABEL } from '../../data/hoods';
import type { Take, User } from '../../store';
import { space, typeScale, useThemeColors } from '../../theme';
import { timeAgo, timeLeftLabel } from '../../utils/format';
import { tap as hapticTap } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';
import { MoreIcon } from '../shared/icons';

export interface TakeHeaderProps {
  author: User;
  take: Take;
  isViewer: boolean;
  onMore: () => void;
}

/** Author row with Hood + expiry urgency — theme-aware. */
export function TakeHeader({ author, take, isViewer, onMore }: TakeHeaderProps): React.JSX.Element {
  const router = useRouter();
  const t = useThemeColors();
  const left = timeLeftLabel(take.expiresAt);
  const urgent = left === 'EXPIRED' || left.startsWith('under') || /^\d+m left/.test(left);

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
        <Avatar name={author.name} tint={author.tint} size={36} />
      </Pressable>
      <View style={styles.names}>
        <Text allowFontScaling={false} style={[styles.primary, { color: t.textPrimary }]} numberOfLines={1}>
          {author.name}
          <Text
            style={{ color: t.textSecondary, fontWeight: '600' }}
            suppressHighlighting
            onPress={() => router.push(`/hood/${take.hood}`)}
          >
            {'  · '}
            {HOOD_LABEL[take.hood]}
          </Text>
        </Text>
        <Text allowFontScaling={false} style={[styles.secondary, { color: t.textMuted }]} numberOfLines={1}>
          @{author.handle} · {timeAgo(take.createdAt)}
          {isViewer ? ' · You' : ''}
          {' · '}
          <Text style={{ color: urgent ? t.accent : t.textMuted, fontWeight: urgent ? '600' : '400' }}>
            {left}
          </Text>
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
        <MoreIcon size={20} color={t.textMuted} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  names: { flex: 1, gap: 2 },
  primary: { ...typeScale.label, fontWeight: '700', fontSize: 15 },
  secondary: { ...typeScale.meta, fontSize: 12 },
  more: { padding: space.xs, marginRight: -space.xs },
});
