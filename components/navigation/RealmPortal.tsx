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
  onDone: () => void;
}

const OUT_MS = 620;
const IN_MS = 300;

/**
 * Realm Shift portal (spec §16): the current realm contracts/fades while a
 * glass portal blooms open at ~620ms. Cleaner and calmer than the Arena —
 * entering another world, never a loading screen.
 */
export function RealmPortal({ direction, onDone }: RealmPortalProps): React.JSX.Element {
  const progress = useSharedValue(0);
  const done = React.useRef(onDone);
  done.current = onDone;

  React.useEffect(() => {
    hapticPress();
    progress.value = withSequence(
      withTiming(1, { duration: OUT_MS, easing: ease.inOut }),
      withTiming(2, { duration: IN_MS, easing: Easing.out(Easing.quad) }),
    );
    const timer = setTimeout(() => done.current(), OUT_MS + IN_MS + 40);
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
    </Animated.View>
  );
}

export const REALM_SHIFT_MS = OUT_MS + IN_MS;

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

export { REALM_SHIFT_MS as REALM_PORTAL_MS };
