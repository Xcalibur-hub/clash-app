import React from 'react';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  blurIntensity,
  glassBorder,
  glassFill,
  gradient,
  radius,
  scale,
  space,
  supportsBlur,
  type GlassLevel,
} from '../../theme';

export interface GlassCardProps {
  children: React.ReactNode;
  level?: GlassLevel;
  /** Corner radius; defaults to the large Apple-style radius. */
  corner?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Thin bright line along the top edge — the "light catching glass" cue. */
  edge?: boolean
  ;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * The core Liquid Glass surface: blurred layer + translucent fill + hairline
 * border + optional top sheen. Pressable variant adds a springless scale press.
 */
export function GlassCard({
  children,
  level = 'regular',
  corner = radius.xl,
  onPress,
  style,
  contentStyle,
  edge = true,
  accessibilityLabel,
  accessibilityHint,
}: GlassCardProps): React.JSX.Element {
  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scale.press) * press.value }],
  }));

  const surface: ViewStyle = {
    borderRadius: corner,
    backgroundColor: glassFill[level],
    borderWidth: 1,
    borderColor: glassBorder[level],
    overflow: 'hidden',
  };

  const inner = (
    <>
      {supportsBlur ? (
        <BlurView intensity={blurIntensity[level]} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <LinearGradient
          colors={gradient.glass}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
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
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  content: { padding: space.lg },
});
