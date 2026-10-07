/**
 * Short premium verdict sequence (~1.2s) then settles static.
 * Uses only canonical ballot values — no fabricated stats.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type { ArenaDuel } from '../../utils/arenaDuelPayload';
import { space, typeScale, useThemeColors } from '../../theme';
import { duelResultTitle } from '../../utils/duelPresentation';
import { notify as hapticNotify } from '../../utils/haptics';

function ballotShare(score: number, jurySize: number): number | null {
  if (!Number.isFinite(score) || !Number.isFinite(jurySize) || jurySize <= 0) return null;
  return Math.round((score / jurySize) * 100);
}

export interface VerdictRevealProps {
  duel: ArenaDuel;
}

function AnimatedPercent({ value }: { value: number }): React.JSX.Element {
  const reduced = useReducedMotion();
  const t = useThemeColors();
  const progress = useSharedValue(reduced ? 1 : 0);

  React.useEffect(() => {
    progress.value = reduced
      ? 1
      : withDelay(280, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [progress, reduced, value]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.value * 0.65,
    transform: [{ translateY: (1 - progress.value) * 8 }],
  }));

  // Display target percent; animation is visual emphasis only (not a counting fake).
  return (
    <Animated.Text allowFontScaling style={[styles.pct, { color: t.textPrimary }, style]}>
      {value}%
    </Animated.Text>
  );
}

export function VerdictReveal({ duel }: VerdictRevealProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const verdict = duel.verdict;
  const title = duelResultTitle(duel) ?? 'Verdict';
  const dim = useSharedValue(reduced ? 1 : 0);
  const bloom = useSharedValue(0);
  const notified = React.useRef(false);

  React.useEffect(() => {
    if (!notified.current && verdict) {
      notified.current = true;
      hapticNotify(duel.status === 'cancelled' ? 'warning' : 'success');
    }
    if (reduced) {
      dim.value = 1;
      bloom.value = 0;
      return;
    }
    dim.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) });
    bloom.value = withDelay(
      200,
      withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }, () => {
        bloom.value = withTiming(0.35, { duration: 400 });
      }),
    );
  }, [bloom, dim, duel.status, reduced, verdict]);

  const veil = useAnimatedStyle(() => ({
    opacity: dim.value * 0.22,
  }));
  const bloomStyle = useAnimatedStyle(() => ({
    opacity: bloom.value * 0.4,
    transform: [{ scale: 0.9 + bloom.value * 0.2 }],
  }));

  if (!verdict) {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.eyebrow, { color: t.textMuted }]}>VERDICT</Text>
        <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>
          {title}
        </Text>
      </View>
    );
  }

  const aPct =
    verdict.sideAScore !== undefined && verdict.sideBScore !== undefined
      ? ballotShare(verdict.sideAScore, verdict.jurySize)
      : null;
  const bPct =
    verdict.sideAScore !== undefined && verdict.sideBScore !== undefined
      ? ballotShare(verdict.sideBScore, verdict.jurySize)
      : null;

  return (
    <View style={styles.wrap}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.veil, { backgroundColor: t.background }, veil]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.bloom, { backgroundColor: '#F5D76E' }, bloomStyle]}
      />

      <Animated.Text
        entering={reduced ? undefined : FadeIn.duration(280)}
        style={[styles.eyebrow, { color: t.textMuted }]}
      >
        VERDICT
      </Animated.Text>

      <Animated.Text
        entering={reduced ? undefined : FadeInDown.delay(80).springify().damping(16)}
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={[styles.title, { color: t.textPrimary }]}
      >
        {title}
      </Animated.Text>

      <Animated.View
        entering={reduced ? undefined : FadeInDown.delay(180).springify().damping(18)}
        style={styles.scoreBlock}
      >
        {([
          { fighter: duel.fighterA, side: 'A' as const, pct: aPct },
          { fighter: duel.fighterB, side: 'B' as const, pct: bPct },
        ]).map(({ fighter, side, pct }) => (
          <View key={side} style={styles.scoreRow}>
            <View style={styles.identity}>
              <Text numberOfLines={1} style={[styles.name, { color: t.textPrimary }]}>
                {fighter.name}
              </Text>
              <Text style={[styles.side, { color: t.textMuted }]}>Fighter {side}</Text>
            </View>
            {pct !== null ? <AnimatedPercent value={pct} /> : null}
          </View>
        ))}
        <Text style={[styles.jury, { color: t.textMuted }]}>
          {verdict.jurySize} judgment{verdict.jurySize === 1 ? '' : 's'}
          {verdict.verdictLabel ? ` · ${verdict.verdictLabel}` : ''}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.md,
    paddingVertical: space.md,
    overflow: 'hidden',
  },
  veil: { borderRadius: 12 },
  bloom: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    top: -20,
    alignSelf: 'center',
  },
  eyebrow: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    ...typeScale.title,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  scoreBlock: { gap: space.sm },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    gap: space.sm,
  },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typeScale.label, fontSize: 16, fontWeight: '700' },
  side: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '500',
  },
  pct: {
    ...typeScale.data,
    fontSize: 24,
    fontWeight: '700',
    minWidth: 56,
    textAlign: 'right',
  },
  jury: {
    ...typeScale.caption,
    fontSize: 12,
    marginTop: space.xs,
  },
});
