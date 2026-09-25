import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { accent, color, ease, ink, typeScale } from '../../theme';
import { press as hapticPress } from '../../utils/haptics';

export type RealmDirection = 'arena-to-vault' | 'vault-to-arena';

export interface RealmPortalProps {
  direction: RealmDirection;
  /** Session-first shift renders the expressive bloom; later shifts crossfade (spec §14). */
  first?: boolean;
  onDone: () => void;
}

/** First shift: expressive bloom, 640ms total (spec §14 wants 500–700ms). */
const FIRST_OUT_MS = 440;
const FIRST_IN_MS = 200;
/** Repeat shifts: simple veil crossfade, 240ms total (spec §14 wants 200–300ms). */
const REPEAT_OUT_MS = 140;
const REPEAT_IN_MS = 100;

export const REALM_SHIFT_MS = FIRST_OUT_MS + FIRST_IN_MS;
export const REALM_SHIFT_REPEAT_MS = REPEAT_OUT_MS + REPEAT_IN_MS;

/**
 * Realm Shift (spec §14): the current realm contracts/fades while a glass
 * portal blooms open — entering another world, never a loading screen.
 * Only the session's first shift gets the bloom; repeats are a quiet crossfade
 * so every Realm switch does not feel like a dramatic game transition.
 */
export function RealmPortal({
  direction,
  first = true,
  onDone,
}: RealmPortalProps): React.JSX.Element {
  const progress = useSharedValue(0);
  const done = React.useRef(onDone);
  done.current = onDone;
  const outMs = first ? FIRST_OUT_MS : REPEAT_OUT_MS;
  const inMs = first ? FIRST_IN_MS : REPEAT_IN_MS;

  React.useEffect(() => {
    hapticPress();
    progress.value = withSequence(
      withTiming(1, { duration: outMs, easing: first ? ease.inOut : Easing.out(Easing.quad) }),
      withTiming(2, { duration: inMs, easing: Easing.out(Easing.quad) }),
    );
    const timer = setTimeout(() => done.current(), outMs + inMs + 40);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const veil = useAnimatedStyle(() => {
    const p = progress.value;
    return { opacity: p <= 1 ? p * 0.92 : Math.max(0, 0.92 - (p - 1) * 1.6) };
  });
  const ring = useAnimatedStyle(() => {
    const p = Math.min(progress.value, 1);
    return { transform: [{ scale: 0.42 + p * 1.35 }], opacity: 1 - p * 0.55 };
  });
  const core = useAnimatedStyle(() => {
    const p = Math.min(progress.value, 1);
    return { transform: [{ scale: 0.3 + p * 1.5 }], opacity: 0.4 + p * 0.6 };
  });
  const word = useAnimatedStyle(() => {
    const p = progress.value;
    const up = p <= 1 ? p : 1 - (p - 1) * 0.6;
    return { opacity: up, transform: [{ scale: 0.92 + up * 0.08 }] };
  });

  const title = direction === 'arena-to-vault' ? 'THE VAULT' : 'THE ARENA';
  const tone = direction === 'arena-to-vault' ? accent.gold : accent.a;

  return (
    <Animated.View style={[styles.root, veil]} pointerEvents="none">
      {first ? (
        <>
          <View style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%">
              <Defs>
                <RadialGradient id="realm-portal" cx="50%" cy="46%" r="46%">
                  <Stop offset="0" stopColor={tone} stopOpacity={0.5} />
                  <Stop offset="0.55" stopColor={tone} stopOpacity={0.12} />
                  <Stop offset="1" stopColor={tone} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#realm-portal)" />
            </Svg>
          </View>
          <Animated.View style={[styles.ring, ring]}>
            <View style={[styles.ringInner, { borderColor: tone }]} />
          </Animated.View>
          <Animated.View style={[styles.core, core]}>
            <View style={[styles.coreInner, { backgroundColor: tone }]} />
          </Animated.View>
          <Animated.View style={[styles.word, word]}>
            <Text allowFontScaling={false} style={styles.eyebrow}>
              {direction === 'arena-to-vault' ? 'ENTERING' : 'RETURNING TO'}
            </Text>
            <Text allowFontScaling={false} style={styles.title}>
              {title}
            </Text>
          </Animated.View>
        </>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
  },
  ring: { position: 'absolute', width: 260, height: 260, alignItems: 'center', justifyContent: 'center' },
  ringInner: { width: 220, height: 220, borderRadius: 110, borderWidth: 1.5, opacity: 0.8 },
  core: { position: 'absolute', width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  coreInner: { width: 64, height: 64, borderRadius: 32, opacity: 0.5 },
  word: { alignItems: 'center', gap: 6 },
  eyebrow: { ...typeScale.caption, color: ink.tertiary },
  title: { ...typeScale.display, color: ink.primary },
});
