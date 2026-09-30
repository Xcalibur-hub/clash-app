import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';

export interface SearchRowProps {
  avatar?: { name: string; tint: string };
  icon?: LucideIcon;
  iconColor?: string;
  title: string;
  meta?: string;
  label: string;
  onPress: () => void;
}

/** Theme-aware search result row. */
export function SearchRow({
  avatar,
  icon: Icon,
  iconColor,
  title,
  meta,
  label,
  onPress,
}: SearchRowProps): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        hapticPress();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}
    >
      {avatar ? <Avatar name={avatar.name} tint={avatar.tint} size={40} /> : null}
      {Icon ? (
        <View style={[styles.badge, { backgroundColor: t.surfaceMuted, borderColor: t.border }]}>
          <Icon size={16} color={iconColor ?? t.textMuted} strokeWidth={2.2} />
        </View>
      ) : null}
      <View style={styles.body}>
        <Text allowFontScaling={false} numberOfLines={1} style={[styles.title, { color: t.textPrimary }]}>
          {title}
        </Text>
        {meta ? (
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.meta, { color: t.textMuted }]}>
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  title: { ...typeScale.label, fontWeight: '700' },
  meta: { ...typeScale.meta },
});
