import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  radius,
  scale,
  space,
  typeScale,
} from '../../theme';
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
  /** Fully rounded pill (reference design's primary action shape). */
  pill?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * The Arena's primary action ("CLASH"). Gradient fill, accent bloom, physical
 * press scale and medium haptics on engage. Disabled state stays legible.
 */
export function GlowButton({
  label,
  onPress,
  icon: Icon,
  tone = 'a',
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
    <Animated.View
      style={[
        styles.shadow,
        { shadowColor: disabled ? '#000' : palette.glow, shadowOpacity: disabled ? 0 : palette.glowOpacity },
        animated,
        style,
      ]}
    >
      <Pressable
        onPress={handle}
        onPressIn={() => {
          if (disabled) return;
          hapticTap();
          press.value = withTiming(1, { duration: 90 });
        }}
        onPressOut={() => {
          press.value = withTiming(0, { duration: 180 });
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        style={[
          styles.button,
          { borderColor: palette.border },
          compact && styles.compact,
          pill && styles.pill,
          disabled && styles.disabled,
        ]}
      >
        {palette.colors ? (
          <LinearGradient
            colors={palette.colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.fill }]} />
        )}
        {Icon ? <Icon size={compact ? 15 : 17} color={palette.icon} strokeWidth={2.6} /> : null}
        <Text
          allowFontScaling={false}
          style={[typeScale.button, { color: palette.text }, styles.label]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radius.lg,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 50,
    paddingHorizontal: space.xl,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  compact: { minHeight: 40, paddingHorizontal: space.lg, borderRadius: radius.md },
  /** Full pill: the reference design's primary CTA shape. */
  pill: { borderRadius: radius.pill, minHeight: 52 },
  disabled: { opacity: 0.45 },
  label: { letterSpacing: 0.6 },
});
