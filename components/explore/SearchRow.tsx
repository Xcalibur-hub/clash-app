import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { card, ink, radius, space, typeScale } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';
import { Avatar } from '../shared/Avatar';

export interface SearchRowProps {
  /** Initials avatar — used for people results. */
  avatar?: { name: string; tint: string };
  /** Glyph tile — used for takes and Hall of Fame results. */
  icon?: LucideIcon;
  iconColor?: string;
  title: string;
  meta?: string;
  /** Screen-reader label; the visible title may be truncated. */
  label: string;
  onPress: () => void;
}

/** One tappable line in the Explore search results (PRD §15). */
export function SearchRow({
  avatar,
  icon: Icon,
  iconColor,
  title,
  meta,
  label,
  onPress,
}: SearchRowProps): React.JSX.Element {
  return (
    <Pressable
      onPress={() => {
        hapticPress();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.row}
    >
      {avatar ? <Avatar name={avatar.name} tint={avatar.tint} size={40} /> : null}
      {Icon ? (
        <View style={styles.badge}>
          <Icon size={16} color={iconColor ?? ink.tertiary} strokeWidth={2.2} />
        </View>
      ) : null}
      <View style={styles.body}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {meta ? (
          <Text allowFontScaling={false} numberOfLines={1} style={styles.meta}>
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
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.native,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: card.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: card.solid,
  },
  body: { flex: 1, gap: 2 },
  title: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  meta: { ...typeScale.meta, color: ink.tertiary },
});
