/**
 * Meet CTA — solid premium button (no GlowButton).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { radius, scale, typeScale } from '../../theme';
import { BUTTON_TONES, type ButtonTone } from '../shared/buttonTones';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';

export function MeetButton({
  label,
  onPress,
  tone = 'light',
  disabled = false,
  compact = false,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}): React.JSX.Element {
  const press = useSharedValue(0);
  const palette = BUTTON_TONES[tone];
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scale.press) * press.value }],
  }));

  return (
    <Animated.View style={[animated, style]}>
      <Pressable
        onPress={() => {
          if (disabled) return;
          hapticPress();
          onPress();
        }}
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
        style={[
          styles.btn,
          { backgroundColor: palette.fill, borderColor: palette.border },
          compact && styles.compact,
          disabled && styles.disabled,
        ]}
      >
        <Text allowFontScaling={false} style={[typeScale.button, { color: palette.text }]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 48,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { minHeight: 40, paddingHorizontal: 14 },
  disabled: { opacity: 0.45 },
});
