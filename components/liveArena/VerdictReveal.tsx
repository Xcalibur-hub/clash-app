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
import { hasPlayed, markPlayed, shouldPlayOnce } from '../../utils/motionOnce';
import { notify as hapticNotify } from '../../utils/haptics';

function ballotShare(score: number, jurySize: number): number | null {
  if (!Number.isFinite(score) || !Number.isFinite(jurySize) || jurySize <= 0) return null;
  return Math.round((score / jurySize) * 100);
}

export interface VerdictRevealProps {
  duel: ArenaDuel;
}

function AnimatedPercent({ value, size, minWidth, animate }: { value: number; size: number; minWidth: number; animate: boolean }): React.JSX.Element {
  const reduced = useReducedMotion();
  const t = useThemeColors();
  const progress = useSharedValue(reduced || !animate ? 1 : 0);

  React.useEffect(() => {
    progress.value = reduced || !animate
      ? 1
      : withDelay(180, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
  }, [animate, progress, reduced, value]);

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
  // One reveal per canonical verdict per session: reopening a settled room must
  // not replay the sequence or its haptic.
  const momentKey = verdict ? `verdict:${duel.clashId}:${duel.status}:${verdict.verdictLabel}` : '';
  const animateRef = React.useRef<boolean | null>(null);
  if (animateRef.current === null) animateRef.current = momentKey ? !hasPlayed(momentKey) : false;
  const animate = animateRef.current === true;

  React.useEffect(() => {
    if (momentKey && animate) markPlayed(momentKey);
  }, [animate, momentKey]);

  React.useEffect(() => {
    if (!verdict) return;
    if (!shouldPlayOnce(`haptic:${duel.clashId}:${duel.status}:${verdict.verdictLabel}`)) return;
    hapticNotify(duel.status === 'cancelled' ? 'warning' : 'success');
  }, [duel.clashId, duel.status, verdict]);

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
      <Animated.View entering={reduced || !animate ? undefined : FadeIn.duration(220)}>{accent}</Animated.View>

      <Animated.Text
        entering={reduced || !animate ? undefined : FadeInDown.delay(60).duration(220)}
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
        entering={reduced || !animate ? undefined : FadeInDown.delay(140).duration(220)}
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
              <AnimatedPercent value={pct} size={metrics.pctSize} minWidth={metrics.pctMinWidth} animate={animate} />
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
