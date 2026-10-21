/**
 * Short premium verdict sequence (~1.2s) then settles static.
 * Uses only canonical ballot values — no fabricated stats.
 * Announcement, explanation, and scores stay visually separate.
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
import { verdictView } from '../../utils/verdictView';
import { verdictEyebrow, verdictSheetSections } from '../../utils/verdictPresentation';
import { hexWithAlpha, verdictMetrics } from './liveArenaStyles';
import { hasPlayed, shouldPlayOnce } from '../../utils/motionOnce';
import { notify as hapticNotify } from '../../utils/haptics';

/* Percentages come from utils/verdictView, which requires both canonical scores. */

export interface VerdictRevealProps {
  duel: ArenaDuel;
  visible?: boolean;
}

function AnimatedPercent({
  value,
  size,
  minWidth,
  animate,
}: {
  value: number;
  size: number;
  minWidth: number;
  animate: boolean;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  const t = useThemeColors();
  const progress = useSharedValue(reduced || !animate ? 1 : 0);

  React.useEffect(() => {
    progress.value =
      reduced || !animate
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

export function VerdictReveal({ duel, visible = false }: VerdictRevealProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const verdict = duel.verdict;
  const view = verdictView(duel);
  const sections = verdictSheetSections(view);
  const title = view.title ?? 'Verdict';
  const eyebrow = verdictEyebrow(view, duel.status);
  const { width, fontScale } = useWindowDimensions();
  const metrics = verdictMetrics({ width, fontScale });
  // One reveal per canonical verdict per session: reopening a settled room must
  // not replay the sequence or its haptic.
  const momentKey = verdict
    ? `verdict:${duel.clashId}:${duel.status}:${verdict.verdictLabel}`
    : '';
  const animateRef = React.useRef<boolean | null>(null);
  if (animateRef.current === null) {
    animateRef.current = visible && momentKey ? !hasPlayed(momentKey) : false;
  }
  const animate = animateRef.current === true;

  React.useEffect(() => {
    if (visible && momentKey && animate) shouldPlayOnce(momentKey);
  }, [animate, momentKey, visible]);

  React.useEffect(() => {
    if (!visible || !verdict) return;
    if (!shouldPlayOnce(`haptic:${duel.clashId}:${duel.status}:${verdict.verdictLabel}`)) return;
    hapticNotify(duel.status === 'cancelled' ? 'warning' : 'success');
  }, [duel.clashId, duel.status, verdict, visible]);

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
      <Text style={[styles.eyebrow, { color: t.textMuted }]}>{eyebrow}</Text>
    </View>
  );

  if (!verdict) {
    return (
      <View style={styles.wrap} accessibilityLabel="Verdict pending">
        {accent}
        {sections.announcement ? (
          <Text
            accessibilityRole="header"
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
          </Text>
        ) : null}
        {sections.explanation ? (
          <Text style={[styles.explanation, { color: t.textSecondary }]}>
            {sections.explanation}
          </Text>
        ) : null}
      </View>
    );
  }

  const aPct = view.aPct;
  const bPct = view.bPct;

  return (
    <View style={styles.wrap} accessibilityLabel="Official verdict">
      {/* 1 — Announcement */}
      <Animated.View entering={reduced || !animate ? undefined : FadeIn.duration(220)}>
        {accent}
      </Animated.View>

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

      {/* 2 — Winner (canonical only; never SUPPORT) */}
      {sections.winner && view.winnerLabel ? (
        <Animated.View
          entering={reduced || !animate ? undefined : FadeInDown.delay(100).duration(180)}
          style={styles.winnerRow}
        >
          <View
            accessible
            accessibilityLabel={`Official winner: ${view.winnerLabel}`}
            style={[styles.winnerChip, { borderColor: t.borderStrong }]}
          >
            <Text allowFontScaling={false} style={[styles.winnerText, { color: t.textPrimary }]}>
              {view.winnerLabel}
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {/* 3 — Explanation (jury / cancelled / pending) */}
      {sections.explanation ? (
        <Animated.Text
          entering={reduced || !animate ? undefined : FadeInDown.delay(120).duration(180)}
          style={[styles.explanation, { color: t.textMuted }]}
        >
          {sections.explanation}
        </Animated.Text>
      ) : null}

      {/* 4 — Panel shares when both scores exist */}
      {sections.scores ? (
        <Animated.View
          entering={reduced || !animate ? undefined : FadeInDown.delay(140).duration(220)}
          style={styles.scoreBlock}
        >
          {(
            [
              { fighter: duel.fighterA, side: 'A' as const, pct: aPct, position: view.aPosition },
              { fighter: duel.fighterB, side: 'B' as const, pct: bPct, position: view.bPosition },
            ] as const
          ).map(({ fighter, side, pct, position }) => (
            <View
              key={side}
              style={styles.scoreRow}
              accessible
              accessibilityLabel={
                pct !== null
                  ? `${fighter.name}, Fighter ${side}, ${pct}% of the panel`
                  : `${fighter.name}, Fighter ${side}`
              }
            >
              <View style={styles.identity}>
                <Text
                  numberOfLines={metrics.nameLines}
                  style={[styles.name, { color: t.textPrimary }]}
                >
                  {fighter.name}
                </Text>
                <Text style={[styles.side, { color: t.textMuted }]}>Fighter {side}</Text>
                {position ? (
                  <Text numberOfLines={2} style={[styles.position, { color: t.textSecondary }]}>
                    {position}
                  </Text>
                ) : null}
              </View>
              {pct !== null ? (
                <AnimatedPercent
                  value={pct}
                  size={metrics.pctSize}
                  minWidth={metrics.pctMinWidth}
                  animate={animate}
                />
              ) : null}
            </View>
          ))}
        </Animated.View>
      ) : null}
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
  explanation: {
    ...typeScale.body,
    fontSize: 13,
    lineHeight: 19,
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
  position: {
    ...typeScale.caption,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  winnerRow: { flexDirection: 'row' },
  winnerChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  winnerText: {
    ...typeScale.caption,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  pct: {
    ...typeScale.data,
    fontWeight: '700',
    textAlign: 'right',
  },
});
