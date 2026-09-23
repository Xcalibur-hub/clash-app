import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { AuroraBackground } from '../components/shared/AuroraBackground';
import { Burst } from '../components/shared/Doodles';
import { useClash } from '../store';
import { duration, ease, ink, radius, space, typeScale } from '../theme';

/** Splash (spec §5): animated wordmark, then Arena (or onboarding). */
export default function SplashScreen(): React.JSX.Element {
  const { state } = useClash();
  const router = useRouter();
  const reduced = useReducedMotion();
  const mark = useSharedValue(0);
  const sub = useSharedValue(0);
  const bar = useSharedValue(0);
  const hasOnboarded = state.hasOnboarded;
  const speed = reduced ? 0 : 1;

  React.useEffect(() => {
    mark.value = withTiming(1, { duration: duration.cinematic * speed, easing: ease.out });
    sub.value = withDelay(200 * speed, withTiming(1, { duration: duration.slow * speed, easing: ease.out }));
    bar.value = withDelay(260 * speed, withTiming(1, { duration: 1300 * speed, easing: ease.inOut }));

    const timer = setTimeout(
      () => router.replace(hasOnboarded ? '/(tabs)' : '/onboard'),
      reduced ? 400 : 1700,
    );
    return () => clearTimeout(timer);
  }, [bar, hasOnboarded, mark, reduced, router, speed, sub]);

  const markStyle = useAnimatedStyle(() => ({
    opacity: mark.value,
    transform: [{ translateY: (1 - mark.value) * 14 }, { scale: 0.96 + mark.value * 0.04 }],
  }));
  const subStyle = useAnimatedStyle(() => ({
    opacity: sub.value,
    transform: [{ translateY: (1 - sub.value) * 10 }],
  }));
  const barStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));

  return (
    <AuroraBackground doodles={false}>
      <View style={styles.wrap}>
        <Animated.View style={[styles.markWrap, markStyle]}>
          <Text allowFontScaling={false} style={styles.wordmark}>
            CLASH
          </Text>
          <Burst size={22} color={ink.primary} opacity={0.5} style={styles.burst} />
        </Animated.View>

        <Animated.View style={[styles.subWrap, subStyle]}>
          <Text allowFontScaling={false} style={styles.subtitle}>
            Make a take. Start a clash.
          </Text>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, barStyle]} />
          </View>
          <Text allowFontScaling={false} style={styles.tagline}>
            MAKE YOUR TAKE.
          </Text>
        </Animated.View>
      </View>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg },
  markWrap: { alignItems: 'flex-start' },
  wordmark: { ...typeScale.display, fontSize: 46, lineHeight: 52, letterSpacing: 9, color: ink.primary },
  burst: { position: 'absolute', top: -6, right: -20 },
  subWrap: { alignItems: 'center', gap: space.md },
  subtitle: { ...typeScale.body, color: ink.secondary },
  track: {
    width: 132,
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  fill: { height: 2, backgroundColor: ink.primary },
  tagline: { ...typeScale.caption, color: ink.quaternary },
});
