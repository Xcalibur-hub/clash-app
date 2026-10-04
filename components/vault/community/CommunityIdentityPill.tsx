import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { tap as hapticTap } from '../../../utils/haptics';

export interface CommunityIdentityPillProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

/** One identity choice in the composer ("Post as Kevin" / the alias). */
export function CommunityIdentityPill({
  label,
  active,
  onPress,
}: CommunityIdentityPillProps): React.JSX.Element {
  const t = useThemeColors();
  const activeBg = t.scheme === 'light' ? t.textPrimary : 'rgba(255,255,255,0.12)';
  const activeText = t.scheme === 'light' ? t.textInverse : t.textPrimary;
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.pill,
        { backgroundColor: active ? activeBg : 'transparent', borderColor: t.border },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[styles.label, { color: active ? activeText : t.textSecondary }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
  label: { ...typeScale.caption, fontSize: 12, fontWeight: '700' },
});
