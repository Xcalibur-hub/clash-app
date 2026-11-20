import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { radius, scale, space, typeScale } from '../../theme';
import { BUTTON_TONES, type ButtonTone } from './buttonTones';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';

export type { ButtonTone };

export interface GlowButtonProps {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  tone?: ButtonTone;
  disabled?: boolean;
  /** Slimmer CTA for inline / secondary use. */
  compact?: boolean;
  /** Fully rounded pill (kept only where semantically useful). */
  pill?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * The app's primary button: a solid, near-white fill by default with a subtle
 * press scale and haptic feedback. No gradient, no glow shadow, no bloom.
 */
export function GlowButton({
  label,
  onPress,
  icon: Icon,
  tone = 'light',
  disabled = false,
  compact = false,
  pill = false,
  style,
  accessibilityLabel,
  accessibilityHint,
}: GlowButtonProps): React.JSX.Element {
  const press = useSharedValue(0);
  const palette = BUTTON_TONES[tone];
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scale.press) * press.value }],
  }));

  const handle = (): void => {
    if (disabled) return;
    hapticPress();
    onPress();
  };

  return (
    <Animated.View style={[animated, style]}>
      <Pressable
        onPress={handle}
        onPressIn={() => {
          if (disabled) return;
          hapticTap();
          press.value = withTiming(1, { duration: 90 });
        }}
        onPressOut={() => {
          press.value = withTiming(0, { duration: 160 });
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        style={[
          styles.button,
          { backgroundColor: palette.fill, borderColor: palette.border },
          compact && styles.compact,
          pill && styles.pill,
          disabled && styles.disabled,
        ]}
      >
        {Icon ? <Icon size={compact ? 15 : 17} color={palette.icon} strokeWidth={2.4} /> : null}
        <Text allowFontScaling={false} style={[typeScale.button, { color: palette.text }]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  compact: { minHeight: 38, paddingHorizontal: space.md, borderRadius: radius.sm },
  /** Full pill: only where a pill is semantically useful. */
  pill: { borderRadius: radius.pill, minHeight: 50 },
  disabled: { opacity: 0.45 },
});
