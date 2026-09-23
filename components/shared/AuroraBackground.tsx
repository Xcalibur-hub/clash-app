import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { accent, color, ease } from '../../theme';
import { ArrowMark, Burst, ScribbleCircle } from './Doodles';

export type GlowTone = 'arena' | 'duel' | 'calm';

const TONES: Record<GlowTone, readonly [string, string]> = {
  arena: [accent.a, accent.violet],
  duel: [accent.a, accent.b],
  calm: [accent.violet, accent.mint],
};

function Bloom({
  size,
  color: glowColor,
  style,
  opacity,
}: {
  size: number;
  color: string;
  style: ViewStyle;
  opacity: number;
}): React.JSX.Element {
  const center = size / 2;
  const id = `bloom-${glowColor.replace('#', '')}-${size}`;
  return (
    <View style={[styles.bloom, style, { width: size, height: size, opacity }]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx={center} cy={center} r={center} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={glowColor} stopOpacity={0.55} />
            <Stop offset="0.55" stopColor={glowColor} stopOpacity={0.12} />
            <Stop offset="1" stopColor={glowColor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * Arena backdrop: #08080B plus two slow drifting light blooms. The drift is
 * skipped entirely when the OS asks for reduced motion (spec §34).
 */
export function AuroraBackground({
  children,
  tone = 'arena',
  doodles = true,
}: {
  children: React.ReactNode;
  tone?: GlowTone;
  doodles?: boolean;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);
  const [primary, secondary] = TONES[tone];

  React.useEffect(() => {
    if (reduced) {
      drift.value = 0;
      return;
    }
    drift.value = withRepeat(withTiming(1, { duration: 9_000, easing: ease.inOut }), -1, true);
  }, [drift, reduced]);

  const topStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drift.value * 26 }, { translateY: drift.value * -18 }],
  }));
  const bottomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drift.value * -22 }, { translateY: drift.value * 14 }],
  }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.layer, topStyle]} pointerEvents="none">
        <Bloom size={420} color={primary} opacity={0.5} style={{ top: -140, left: -120 }} />
      </Animated.View>
      <Animated.View style={[styles.layer, bottomStyle]} pointerEvents="none">
        <Bloom size={460} color={secondary} opacity={0.42} style={{ bottom: -160, right: -140 }} />
      </Animated.View>
      {doodles ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <ScribbleCircle size={78} style={{ position: 'absolute', top: '18%', right: 22 }} />
          <Burst size={26} style={{ position: 'absolute', top: '36%', left: 16 }} />
          <ArrowMark size={40} style={{ position: 'absolute', bottom: '24%', left: 26 }} />
        </View>
      ) : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  layer: { ...StyleSheet.absoluteFillObject },
  bloom: { position: 'absolute' },
  content: { flex: 1 },
});
