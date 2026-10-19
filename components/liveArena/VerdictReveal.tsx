/**
 * Short premium verdict sequence (~1.2s) then settles static.
 * Uses only canonical ballot values — no fabricated stats.
 */
import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
import { hexWithAlpha, verdictMetrics } from './liveArenaStyles';
import { notify as hapticNotify } from '../../utils/haptics';

function ballotShare(score: number, jurySize: number): number | null {
  if (!Number.isFinite(score) || !Number.isFinite(jurySize) || jurySize <= 0) return null;
  return Math.round((score / jurySize) * 100);
}

export interface VerdictRevealProps {
  duel: ArenaDuel;
}

function AnimatedPercent({ value, size, minWidth }: { value: number; size: number; minWidth: number }): React.JSX.Element {
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
    <Animated.Text
      allowFontScaling
      style={[styles.pct, { fontSize: size, minWidth, color: t.textPrimary }, style]}
    >
      {value}%
    </Animated.Text>
  );
}

export function VerdictReveal({ duel }: VerdictRevealProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const verdict = duel.verdict;
  const title = duelResultTitle(duel) ?? 'Verdict';
  const { width, fontScale } = useWindowDimensions();
  const metrics = verdictMetrics({ width, fontScale });
  const notified = React.useRef(false);

  React.useEffect(() => {
    if (!notified.current && verdict) {
      notified.current = true;
      hapticNotify(duel.status === 'cancelled' ? 'warning' : 'success');
    }
    // The decorative wash/veil is gone: nothing is animated behind the copy.
  }, [duel.status, verdict]);

  // No decorative absolutely-positioned layer is drawn behind the result copy.

  // Restrained, in-flow verdict cue: a short gold rule before the eyebrow.
  // It cannot overlap the headline, fighters or percentages because it shares
  // the sheet's layout flow instead of being absolutely positioned.
  const accent = (
    <View style={styles.eyebrowRow}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.accentRule,
          { backgroundColor: hexWithAlpha('#F5D76E', t.scheme === 'light' ? 0.95 : 0.85) },
        ]}
      />
      <Text style={[styles.eyebrow, { color: t.textMuted }]}>VERDICT</Text>
    </View>
  );

  if (!verdict) {
    return (
      <View style={styles.wrap}>
        {accent}
        <Text
          accessibilityRole="header"
          style={[
            styles.title,
            { fontSize: metrics.titleSize, lineHeight: metrics.titleLineHeight, color: t.textPrimary },
          ]}
        >
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
      <Animated.View entering={reduced ? undefined : FadeIn.duration(280)}>{accent}</Animated.View>

      <Animated.Text
        entering={reduced ? undefined : FadeInDown.delay(80).springify().damping(16)}
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={[
          styles.title,
          {
            fontSize: metrics.titleSize,
            lineHeight: metrics.titleLineHeight,
            color: t.textPrimary,
          },
        ]}
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
              <Text numberOfLines={metrics.nameLines} style={[styles.name, { color: t.textPrimary }]}>
                {fighter.name}
              </Text>
              <Text style={[styles.side, { color: t.textMuted }]}>Fighter {side}</Text>
            </View>
            {pct !== null ? (
              <AnimatedPercent value={pct} size={metrics.pctSize} minWidth={metrics.pctMinWidth} />
            ) : null}
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
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accentRule: {
    width: 24,
    height: 2,
    borderRadius: 1,
  },
  eyebrow: {
    ...typeScale.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    ...typeScale.title,
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
    fontWeight: '700',
    textAlign: 'right',
  },
  jury: {
    ...typeScale.caption,
    fontSize: 12,
    marginTop: space.xs,
  },
});
