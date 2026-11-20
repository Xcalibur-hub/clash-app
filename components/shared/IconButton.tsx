import React from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { accent, glassFill, ink, radius, scale } from '../../theme';
import { withAlpha } from '../../utils/color';
import { tap as hapticTap } from '../../utils/haptics';

export interface IconButtonProps {
  icon: LucideIcon;
  onPress: () => void;
  /** Required for screen readers — these are icon-only controls. */
  label: string;
  size?: number;
  /** Highlights the control when its state is on (e.g. saved). */
  active?: boolean;
  tone?: 'neutral' | 'a' | 'gold';
  style?: StyleProp<ViewStyle>;
}

const TONE_COLOR = { neutral: ink.secondary, a: accent.a, gold: accent.gold } as const;

/** Circular glass control used for card actions and the Clash header. */
export function IconButton({
  icon: Icon,
  onPress,
  label,
  size = 38,
  active = false,
  tone = 'neutral',
  style,
}: IconButtonProps): React.JSX.Element {
  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scale.press) * press.value }],
  }));

  const iconColor = active ? TONE_COLOR[tone] : ink.secondary;
  const borderColor = active ? withAlpha(TONE_COLOR[tone], 0.5) : 'rgba(255,255,255,0.12)';

  return (
    <Animated.View style={animated}>
      <Pressable
        onPress={() => {
          hapticTap();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        style={[
          styles.button,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor,
            backgroundColor: active ? withAlpha(TONE_COLOR[tone], 0.14) : glassFill.soft,
          },
          style,
        ]}
      >
        <View pointerEvents="none">
          <Icon size={Math.round(size * 0.46)} color={iconColor} strokeWidth={2.3} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
  },
});
