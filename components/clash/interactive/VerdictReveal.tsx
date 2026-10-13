/**
 * Server-authoritative verdict reveal — dramatic but restrained.
 */
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type { ServerVerdict } from '../../../services/clashEngineService';
import type { Side } from '../../../store';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { CountUp } from '../../shared/CountUp';
import { notify as hapticNotify } from '../../../utils/haptics';

export interface VerdictRevealProps {
  verdict: ServerVerdict;
  myBallot: Side | null;
  reputationDelta: number;
  coinsDelta: number;
  onRevealed?: () => void;
}

export function VerdictReveal({
  verdict,
  myBallot,
  reputationDelta,
  coinsDelta,
  onRevealed,
}: VerdictRevealProps): React.JSX.Element {
  const t = useThemeColors();
  const reduced = useReducedMotion();
  const phase = useSharedValue(reduced ? 1 : 0);
  const isDraw = verdict.winnerSide === 'DRAW';
  const dark = t.scheme === 'dark';
  const tone = dark ? '#FFF4E9' : '#261D2A';
  const winnerFill = isDraw
    ? (dark ? '#3F394A' : '#F8DE8D')
    : verdict.winnerSide === 'A'
      ? (dark ? '#49365D' : '#E8D8FF')
      : (dark ? '#61414A' : '#FFD0B8');
  const pct = verdict.jurySize > 0 ? Math.round(verdict.agreement * 100) : 0;
  const judgeWord = verdict.jurySize === 1 ? 'judgment' : 'judgments';
  const total = Math.max(1, verdict.sideAScore + verdict.sideBScore);
  const sideAColor = dark ? '#B89BD9' : '#9A70BF';
  const sideBColor = dark ? '#F3AB91' : '#D57E64';
  const aShare = verdict.sideAScore / total;
  const bShare = verdict.sideBScore / total;

  React.useEffect(() => {
    if (reduced) {
      onRevealed?.();
      return;
    }
    phase.value = withDelay(180, withTiming(1, { duration: 520 }));
    const tmr = setTimeout(() => {
      hapticNotify(isDraw ? 'warning' : 'success');
      onRevealed?.();
    }, 700);
    return () => clearTimeout(tmr);
  }, [isDraw, onRevealed, phase, reduced]);

  const veil = useAnimatedStyle(() => ({
    opacity: 0.08 + phase.value * 0.06,
  }));
  const content = useAnimatedStyle(() => ({
    opacity: phase.value,
    transform: [{ translateY: (1 - phase.value) * 12 }, { scale: 0.98 + phase.value * 0.02 }],
  }));

  let personal: string | null = null;
  if (isDraw) personal = 'This Clash ended in a draw.';
  else if (myBallot && myBallot === verdict.winnerSide) personal = 'You backed the winning side.';
  else if (myBallot) personal = `You backed Side ${myBallot}.`;

  return (
    <View style={styles.root}>
      <Animated.View
        pointerEvents="none"
        style={[styles.veil, { backgroundColor: t.textPrimary }, veil]}
      />
      <Animated.View
        style={[
          styles.card,
          { borderColor: 'transparent', backgroundColor: winnerFill },
          content,
        ]}
      >
        <Text allowFontScaling={false} style={[styles.eyebrow, { color: dark ? '#E7D6E3' : '#635262' }]}>
          THE PEOPLE HAVE SPOKEN
        </Text>
        {!isDraw ? (
          <Text allowFontScaling={false} style={[styles.sideWin, { color: tone }]}>
            SIDE {verdict.winnerSide}
          </Text>
        ) : null}
        <Text allowFontScaling={false} style={[styles.headline, { color: tone }]}>
          {isDraw ? 'IT’S A DRAW' : 'TAKES THE WIN.'}
        </Text>
        {!isDraw ? (
          <Text allowFontScaling={false} style={[styles.label, { color: dark ? '#E7D6E3' : '#635262' }]}>
            {verdict.verdictLabel}
          </Text>
        ) : null}

        <View style={styles.scoreRow}>
          <CountUp
            value={pct}
            suffix="%"
            style={[styles.pct, { color: tone }]}
            accessibilityLabel={`${pct} percent`}
          />
          <Text allowFontScaling={false} style={[styles.meta, { color: dark ? '#E7D6E3' : '#635262' }]}>
            {verdict.jurySize.toLocaleString('en-IN')} {judgeWord}
          </Text>
        </View>

        <View style={[styles.barTrack, { backgroundColor: t.surfaceMuted }]}>
          <View
            style={[
              styles.barA,
              { flex: Math.max(aShare, 0.04), backgroundColor: sideAColor },
            ]}
          />
          <View
            style={[
              styles.barB,
              { flex: Math.max(bShare, 0.04), backgroundColor: sideBColor },
            ]}
          />
        </View>
        <View style={styles.tally}>
          <Text allowFontScaling={false} style={[styles.tallyText, { color: dark ? '#DDC6F2' : '#65417C' }]}>
            A · {verdict.sideAScore}
          </Text>
          <Text allowFontScaling={false} style={[styles.tallyText, { color: dark ? '#FFCEBB' : '#8B432F' }]}>
            B · {verdict.sideBScore}
          </Text>
        </View>

        {personal ? (
          <Text allowFontScaling={false} style={[styles.personal, { color: tone }]}>
            {personal}
          </Text>
        ) : null}

        {reputationDelta > 0 || coinsDelta > 0 ? (
          <Text allowFontScaling={false} style={[styles.reward, { color: dark ? '#E7D6E3' : '#635262' }]}>
            {reputationDelta > 0 ? `+${reputationDelta} reputation` : ''}
            {reputationDelta > 0 && coinsDelta > 0 ? ' · ' : ''}
            {coinsDelta > 0 ? `+${coinsDelta} coins` : ''}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative' },
  veil: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
  },
  card: {
    gap: space.sm,
    padding: 24,
    borderRadius: 28,
    borderWidth: 0,
  },
  eyebrow: {
    ...typeScale.caption,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '900',
  },
  sideWin: { ...typeScale.title, fontWeight: '600', letterSpacing: -0.3 },
  headline: { ...typeScale.display, fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }), fontSize: 39, lineHeight: 44, fontWeight: '900', letterSpacing: -1.4 },
  label: { ...typeScale.meta },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: space.xs },
  pct: { ...typeScale.display, fontSize: 44, fontWeight: '900', letterSpacing: -1.2 },
  meta: { ...typeScale.meta, flexShrink: 1 },
  barTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    gap: 2,
    marginTop: space.xs,
  },
  barA: { borderRadius: 3 },
  barB: { borderRadius: 3 },
  tally: { flexDirection: 'row', gap: space.lg },
  tallyText: { ...typeScale.data, fontSize: 13, fontWeight: '600' },
  personal: { ...typeScale.body, fontWeight: '600', marginTop: space.xs },
  reward: { ...typeScale.label, fontWeight: '600' },
});
