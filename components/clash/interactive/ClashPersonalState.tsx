/**
 * Post-judgement lock — satisfying, restrained confirmation.
 * No confetti, fake rewards, or invented points.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { Side } from '../../../store';
import { duration, radius, space, spring, typeScale, useThemeColors } from '../../../theme';
import { VerifiedIcon } from '../../shared/icons';
import { useDuelSurface } from './clashTheme';
import { notify as hapticNotify } from '../../../utils/haptics';

export function ClashPersonalState({ side }: { side: Side }): React.JSX.Element {
  const t = useThemeColors();
  const { tone, soft } = useDuelSurface(side);
  const reduced = useReducedMotion();
  const enter = useSharedValue(reduced ? 1 : 0);
  const check = useSharedValue(reduced ? 1 : 0);

  React.useEffect(() => {
    if (reduced) {
      hapticNotify('success');
      return;
    }
    enter.value = withTiming(1, { duration: duration.cinematic });
    check.value = withDelay(
      120,
      withSpring(1, { ...spring.settle, stiffness: 260, damping: 16 }),
    );
    const tmr = setTimeout(() => hapticNotify('success'), 180);
    return () => clearTimeout(tmr);
  }, [check, enter, reduced]);

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 10 }, { scale: 0.97 + enter.value * 0.03 }],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: check.value,
    transform: [{ scale: 0.6 + check.value * 0.4 }],
  }));

  return (
    <Animated.View
      style={[
        styles.wrap,
        { borderColor: tone, backgroundColor: soft },
        wrapStyle,
      ]}
      accessibilityLabel={`Judgement locked. You backed Side ${side}`}
    >
      <View style={styles.row}>
        <Animated.View style={checkStyle}>
          <VerifiedIcon size={22} color={tone} strokeWidth={2.4} />
        </Animated.View>
        <Text allowFontScaling={false} style={[styles.kicker, { color: tone }]}>
          Judgement locked
        </Text>
      </View>
      <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]}>
        You backed Side {side}
      </Text>
      <Text allowFontScaling={false} style={[styles.body, { color: t.textMuted }]}>
        Results reveal when judging closes.
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.xs,
    paddingVertical: space.md + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  kicker: {
    ...typeScale.caption,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '700',
    fontSize: 11,
  },
  title: { ...typeScale.title, fontWeight: '700', letterSpacing: -0.3 },
  body: { ...typeScale.meta, lineHeight: 18 },
});
