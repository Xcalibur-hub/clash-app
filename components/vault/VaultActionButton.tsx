import React from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { PressableScale } from '../shared/PressableScale';

export interface VaultActionButtonProps {
  label: string;
  onPress: () => void;
  tone?: 'solid' | 'quiet';
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Calm Vault CTA — no glow, no neon. */
export function VaultActionButton({
  label,
  onPress,
  tone = 'solid',
  compact = false,
  style,
  accessibilityLabel,
}: VaultActionButtonProps): React.JSX.Element {
  const t = useThemeColors();
  const solid = tone === 'solid';

  return (
    <PressableScale
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.btn,
        compact && styles.compact,
        {
          backgroundColor: solid
            ? t.scheme === 'light'
              ? t.textPrimary
              : t.surfaceElevated
            : t.surface,
          borderColor: t.border,
        },
        style,
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.label,
          {
            color: solid
              ? t.scheme === 'light'
                ? t.textInverse
                : t.textPrimary
              : t.textPrimary,
          },
        ]}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  compact: {
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  label: {
    ...typeScale.label,
    fontWeight: '600',
  },
});
