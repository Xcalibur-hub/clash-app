import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { card, radius, scale, space, type GlassLevel } from '../../theme';

export interface GlassCardProps {
  children: React.ReactNode;
  level?: GlassLevel;
  /** Corner radius; defaults to a restrained card radius. */
  corner?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Thin top edge (de-emphasised; off by default). */
  edge?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * A neutral solid surface with a hairline border — no blur, no gradient, no
 * sheen. `level` is accepted for compatibility but no longer changes the fill;
 * real blur belongs only to modals/sheets via a native overlay.
 */
export function GlassCard({
  children,
  corner = radius.lg,
  onPress,
  style,
  contentStyle,
  edge = false,
  accessibilityLabel,
  accessibilityHint,
}: GlassCardProps): React.JSX.Element {
  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scale.press) * press.value }],
  }));

  const surface: ViewStyle = {
    borderRadius: corner,
    backgroundColor: card.solid,
    borderWidth: 1,
    borderColor: card.border,
    overflow: 'hidden',
  };

  const inner = (
    <>
      {edge ? <View style={styles.edge} pointerEvents="none" /> : null}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </>
  );

  if (!onPress) {
    return <View style={[surface, style]}>{inner}</View>;
  }

  return (
    <Animated.View style={[animated, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          press.value = withTiming(1, { duration: 90 });
        }}
        onPressOut={() => {
          press.value = withTiming(0, { duration: 160 });
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        style={surface}
      >
        {inner}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  edge: {
    position: 'absolute',
    top: 0,
    left: space.lg,
    right: space.lg,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  content: { padding: space.md },
});
