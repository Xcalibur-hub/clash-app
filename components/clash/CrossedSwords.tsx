/**
 * CLASH signature: two small editorial swords collide once, spark, settle.
 * Prefer SVG + Reanimated — no Lottie. Respects Reduce Motion + cooldown.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

export interface CrossedSwordsProps {
  /** Fire the collision when this token changes (topic id, enter, etc.). */
  triggerKey?: string | number | null;
  size?: number;
  color?: string;
  /** Minimum ms between plays. */
  cooldownMs?: number;
  /** Soft haptic on collision — only when the trigger is a user gesture. */
  hapticOnImpact?: boolean;
  onImpact?: () => void;
  style?: object;
}

let lastPlayAt = 0;

/**
 * Friendly editorial icon animation — not arcade, not violent.
 * Idle: invisible. On trigger: swords enter, clash, spark, fade.
 */
export function CrossedSwords({
  triggerKey = null,
  size = 44,
  color = '#8A8A8E',
  cooldownMs = 6500,
  hapticOnImpact = false,
  onImpact,
  style,
}: CrossedSwordsProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const impact = useSharedValue(0);
  const spark = useSharedValue(0);
  const lastKey = React.useRef<string | number | null>(null);

  const fireImpact = React.useCallback((): void => {
    onImpact?.();
    if (hapticOnImpact) {
      void import('../../utils/haptics').then((h) => h.tap());
    }
  }, [hapticOnImpact, onImpact]);

  const play = React.useCallback((): void => {
    if (reduced) {
      progress.value = 0;
      impact.value = 0;
      spark.value = 0;
      return;
    }
    const now = Date.now();
    if (now - lastPlayAt < cooldownMs) return;
    lastPlayAt = now;

    progress.value = 0;
    impact.value = 0;
    spark.value = 0;
    progress.value = withSequence(
      withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
      withDelay(100, withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) })),
    );
    impact.value = withDelay(
      240,
      withSequence(
        withTiming(1, { duration: 70, easing: Easing.out(Easing.quad) }, (done) => {
          if (done) runOnJS(fireImpact)();
        }),
        withTiming(0, { duration: 180, easing: Easing.inOut(Easing.quad) }),
      ),
    );
    spark.value = withDelay(
      250,
      withSequence(
        withTiming(1, { duration: 90 }),
        withTiming(0, { duration: 280, easing: Easing.out(Easing.quad) }),
      ),
    );
  }, [cooldownMs, fireImpact, impact, progress, reduced, spark]);

  React.useEffect(() => {
    if (triggerKey == null || triggerKey === '') return;
    if (lastKey.current === triggerKey) return;
    lastKey.current = triggerKey;
    play();
  }, [play, triggerKey]);

  const leftStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateX: (1 - progress.value) * -18 + impact.value * -2 },
      { translateY: (1 - progress.value) * -6 },
      { rotate: `${-28 + progress.value * 10 + impact.value * -4}deg` },
      { scale: 0.92 + impact.value * 0.1 },
    ],
  }));

  const rightStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateX: (1 - progress.value) * 18 + impact.value * 2 },
      { translateY: (1 - progress.value) * -6 },
      { rotate: `${28 - progress.value * 10 + impact.value * 4}deg` },
      { scale: 0.92 + impact.value * 0.1 },
    ],
  }));

  const sparkStyle = useAnimatedStyle(() => ({
    opacity: spark.value * 0.85,
    transform: [{ scale: 0.4 + spark.value * 0.9 }],
  }));

  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { width: size, height: size }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.sword, leftStyle]}>
        <SwordSvg size={size * 0.72} color={color} mirror={false} />
      </Animated.View>
      <Animated.View style={[styles.sword, rightStyle]}>
        <SwordSvg size={size * 0.72} color={color} mirror />
      </Animated.View>
      <Animated.View style={[styles.sparks, sparkStyle]}>
        <SparkSvg size={size * 0.55} color={color} />
      </Animated.View>
    </View>
  );
}

function SwordSvg({
  size,
  color,
  mirror,
}: {
  size: number;
  color: string;
  mirror: boolean;
}): React.JSX.Element {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      style={mirror ? { transform: [{ scaleX: -1 }] } : undefined}
    >
      <Path
        d="M20 4 L22.2 18 L28 16.5 L22.4 20.2 L26 34 L20 28.5 L14 34 L17.6 20.2 L12 16.5 L17.8 18 Z"
        fill={color}
        opacity={0.88}
      />
      <Path d="M16 21.5 L24 21.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" opacity={0.55} />
    </Svg>
  );
}

function SparkSvg({ size, color }: { size: number; color: string }): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Circle cx={20} cy={18} r={1.6} fill={color} />
      <Circle cx={12} cy={14} r={1.1} fill={color} opacity={0.7} />
      <Circle cx={28} cy={15} r={1.2} fill={color} opacity={0.7} />
      <Circle cx={22} cy={26} r={0.9} fill={color} opacity={0.55} />
      <Path d="M20 10 L20.6 14 M20 26 L19.5 22 M11 20 L15 19.4 M29 19 L25 19.6" stroke={color} strokeWidth={1.2} strokeLinecap="round" opacity={0.5} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sword: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparks: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
