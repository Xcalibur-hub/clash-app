import React from 'react';
import { ActivityIndicator, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';
import { PressableScale } from '../shared/PressableScale';

export interface VaultActionButtonProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: 'solid' | 'quiet';
  compact?: boolean;
  /** Translucent treatment for controls sitting on hero media. */
  overMedia?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Calm Vault CTA — no glow, no neon. */
export function VaultActionButton({
  label,
  onPress,
  tone = 'solid',
  compact = false,
  overMedia = false,
  style,
  accessibilityLabel,
  disabled = false,
  busy = false,
}: VaultActionButtonProps): React.JSX.Element {
  const t = useThemeColors();
  const blocked = disabled || busy || !onPress;
  const solid = tone === 'solid';

  let backgroundColor: string;
  let borderColor: string;
  let labelColor: string;

  if (overMedia) {
    backgroundColor = solid ? 'rgba(250,250,248,0.94)' : 'rgba(255,255,255,0.14)';
    borderColor = 'transparent';
    labelColor = solid ? '#141418' : '#FAFAF8';
  } else if (solid) {
    backgroundColor = t.scheme === 'light' ? t.textPrimary : 'rgba(255,255,255,0.12)';
    borderColor = t.border;
    labelColor = t.scheme === 'light' ? t.textInverse : t.textPrimary;
  } else {
    // Quiet: avoid harsh pure-white cards in dark mode
    backgroundColor = t.scheme === 'dark' ? 'rgba(255,255,255,0.06)' : t.surface;
    borderColor = t.border;
    labelColor = t.textPrimary;
  }

  return (
    <PressableScale
      disabled={blocked}
      accessibilityState={{ disabled: blocked, busy }}
      onPress={() => {
        if (blocked) return;
        hapticTap();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.btn,
        compact && styles.compact,
        {
          backgroundColor,
          borderColor,
        },
        style,
        blocked && { opacity: 0.55 },
      ]}
    >
      {busy ? <ActivityIndicator color={labelColor} accessibilityLabel="Working" /> : null}
      <Text style={[styles.label, { color: labelColor }]}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  compact: {
    paddingHorizontal: space.md,
    paddingVertical: 9,
  },
  label: {
    ...typeScale.label,
    fontSize: 13,
    fontWeight: '700',
  },
});
