/**
 * Short cinematic when genuinely entering Arena (~700–1100ms).
 * Session-gated — does not replay on Take/Clash returns.
 */
import React from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { typeScale, useThemeColors } from '../../theme';
import { ArenaAtmosphere } from './ArenaAtmosphere';

export interface ArenaEntranceProps {
  active: boolean;
  onDone: () => void;
}

const TOTAL_MS = 920;
const REDUCED_MS = 220;

export function ArenaEntrance({ active, onDone }: ArenaEntranceProps): React.JSX.Element | null {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const doneRef = React.useRef(false);

  React.useEffect(() => {
    if (!active) return undefined;
    doneRef.current = false;
    AccessibilityInfo.announceForAccessibility('Entering Arena');
    progress.value = 0;
    const duration = reduced ? REDUCED_MS : TOTAL_MS;
    progress.value = withTiming(1, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
    const id = setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    }, duration + 40);
    return () => clearTimeout(id);
  }, [active, onDone, progress, reduced]);

  const veil = useAnimatedStyle(() => ({
    opacity: reduced ? 1 - progress.value : Math.max(0, 1 - progress.value * 1.15),
  }));
  const mark = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: reduced ? (p < 0.5 ? p * 2 : 2 - p * 2) : p < 0.55 ? p / 0.55 : Math.max(0, 1 - (p - 0.55) / 0.45),
      transform: [{ scale: reduced ? 1 : 0.92 + Math.min(1, p * 1.1) * 0.1 }],
    };
  });
  const sides = useAnimatedStyle(() => {
    const p = progress.value;
    const show = reduced ? 0 : Math.min(1, Math.max(0, (p - 0.25) / 0.35));
    return {
      opacity: show * (1 - Math.max(0, (p - 0.7) / 0.3)),
      transform: [{ scaleX: 0.85 + show * 0.15 }],
    };
  });

  if (!active) return null;

  return (
    <View style={styles.root} pointerEvents="auto" accessibilityViewIsModal>
      <ArenaAtmosphere mood="discovery" energy={0.45} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.background }, veil]} />
      <View style={styles.center}>
        <Animated.View style={mark}>
          <Text style={[styles.kicker, { color: t.textMuted }]}>CLASH</Text>
          <Text style={[styles.title, { color: t.textPrimary }]} accessibilityRole="header">
            ARENA
          </Text>
        </Animated.View>
        <Animated.View style={[styles.sides, sides]}>
          <View style={[styles.sil, { backgroundColor: 'rgba(242,193,78,0.35)' }]} />
          <Text style={[styles.vs, { color: t.textMuted }]}>VS</Text>
          <View style={[styles.sil, { backgroundColor: 'rgba(168,197,240,0.35)' }]} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: { zIndex: 1, alignItems: 'center', gap: 28 },
  kicker: {
    ...typeScale.caption,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },
  title: {
    ...typeScale.title,
    fontSize: 48,
    lineHeight: 52,
    fontWeight: '800',
    letterSpacing: -1.2,
    textAlign: 'center',
  },
  sides: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  sil: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  vs: {
    ...typeScale.caption,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
});