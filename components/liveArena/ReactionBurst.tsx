/**
 * Presentational reaction FX for future Crowd/Corner wiring.
 * Not connected to backend actions in Phase 3.6.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

export type ReactionEmoji = '😂' | '🔥' | '💀' | '👏' | '🤯' | (string & {});

export interface FloatingReactionProps {
  emoji: ReactionEmoji;
  /** Replay token — change to fire again. */
  burstKey: string | number;
  /** Horizontal drift bias in px (− = left). */
  drift?: number;
  onDone?: () => void;
}

/** Single emoji: pop, float up, fade (~1.2s). */
export function FloatingReaction({
  emoji,
  burstKey,
  drift = 0,
  onDone,
}: FloatingReactionProps): React.JSX.Element | null {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    setVisible(true);
    progress.value = 0;
    if (reduced) {
      progress.value = withTiming(1, { duration: 200 }, (finished) => {
        if (finished && onDone) runOnJS(onDone)();
      });
      return;
    }
    progress.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished && onDone) runOnJS(onDone)();
    });
  }, [burstKey, onDone, progress, reduced]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: reduced ? 1 - p : p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85,
      transform: [
        { translateY: reduced ? 0 : -48 * p },
        { translateX: reduced ? 0 : drift * p },
        { scale: reduced ? 1 : 0.6 + 0.55 * Math.min(1, p / 0.2) * (1 - p * 0.25) },
      ],
    };
  });

  if (!visible) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.float, style]}>
      <Text style={styles.emoji}>{emoji}</Text>
    </Animated.View>
  );
}

export interface ReactionBurstProps {
  emoji: ReactionEmoji;
  /** Replay token. */
  burstKey: string | number | null;
  count?: number;
}

/** Small fan of floating reactions — lightweight, short-lived. */
export function ReactionBurst({
  emoji,
  burstKey,
  count = 3,
}: ReactionBurstProps): React.JSX.Element | null {
  const reduced = useReducedMotion();
  if (burstKey == null) return null;
  const n = Math.max(1, Math.min(5, count));
  return (
    <View pointerEvents="none" style={styles.burst}>
      {Array.from({ length: n }, (_, i) => (
        <View key={`${burstKey}-${i}`} style={styles.slot}>
          <FloatingReaction
            emoji={emoji}
            burstKey={`${burstKey}-${i}`}
            drift={reduced ? 0 : -24 + i * 12}
          />
        </View>
      ))}
    </View>
  );
}

export interface ClashPulseProps {
  active: boolean;
  color?: string;
}

/** Soft radial pulse for stage emphasis — opacity only. */
export function ClashPulse({ active, color = 'rgba(245,215,110,0.35)' }: ClashPulseProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);

  React.useEffect(() => {
    if (!active || reduced) {
      pulse.value = 0;
      return;
    }
    pulse.value = 0;
    pulse.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }, () => {
      pulse.value = withDelay(40, withTiming(0, { duration: 400 }));
    });
  }, [active, pulse, reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: pulse.value * 0.55,
    transform: [{ scale: 0.92 + pulse.value * 0.18 }],
  }));

  return <Animated.View pointerEvents="none" style={[styles.pulse, { backgroundColor: color }, style]} />;
}

export interface StickerPopProps {
  children: React.ReactNode;
  popKey: string | number;
}

/** Tiny spring-scale for sticker/meme emphasis. */
export function StickerPop({ children, popKey }: StickerPopProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);

  React.useEffect(() => {
    if (reduced) {
      scale.value = 1;
      return;
    }
    scale.value = 0.86;
    scale.value = withTiming(1.06, { duration: 160, easing: Easing.out(Easing.back(1.4)) }, () => {
      scale.value = withTiming(1, { duration: 120 });
    });
  }, [popKey, reduced, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  float: {
    position: 'absolute',
    alignSelf: 'center',
  },
  emoji: { fontSize: 28 },
  burst: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slot: {
    position: 'absolute',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    alignSelf: 'center',
  },
});
