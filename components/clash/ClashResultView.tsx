import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ServerVerdict } from '../../services/clashEngineService';
import { ink, radius, space, typeScale } from '../../theme';
import { CountUp } from '../shared/CountUp';
import { FadeRise } from '../shared/PressableScale';
import { sideTone } from './duelPalette';

export interface ClashResultViewProps {
  verdict: ServerVerdict;
  /** Sum of the viewer's server reputation events for this Clash. */
  reputationDelta: number;
  coinsDelta: number;
}

/** Settled verdict — animated agreement %, strong side hierarchy, no arcade. */
export function ClashResultView({ verdict, reputationDelta, coinsDelta }: ClashResultViewProps): React.JSX.Element {
  const winnerSide = verdict.winnerSide;
  const isDraw = winnerSide === 'DRAW';
  const tone = winnerSide === 'DRAW' ? ink.primary : sideTone(winnerSide).tone;
  const pct = verdict.jurySize > 0 ? Math.round(verdict.agreement * 100) : 0;
  const judgeWord = verdict.jurySize === 1 ? 'judge' : 'judges';
  const total = Math.max(1, verdict.sideAScore + verdict.sideBScore);
  const aShare = verdict.sideAScore / total;
  const bShare = verdict.sideBScore / total;

  return (
    <FadeRise>
      <View style={styles.wrap}>
        <Text allowFontScaling={false} style={[styles.winner, { color: tone }]}>
          {isDraw ? 'DRAW' : `SIDE ${winnerSide} WINS`}
        </Text>
        <View style={styles.scoreRow}>
          <CountUp value={pct} suffix="%" style={[styles.pct, { color: tone }]} accessibilityLabel={`${pct} percent agreement`} />
          <Text allowFontScaling={false} style={styles.scoreMeta}>
            agreement · {verdict.jurySize} {judgeWord}
          </Text>
        </View>
        {isDraw ? null : (
          <Text allowFontScaling={false} style={styles.label}>
            {verdict.verdictLabel}
          </Text>
        )}
        <View style={styles.barTrack}>
          <View style={[styles.barA, { flex: Math.max(aShare, 0.04) }]} />
          <View style={[styles.barB, { flex: Math.max(bShare, 0.04) }]} />
        </View>
        <View style={styles.tally}>
          <View style={styles.tallyItem}>
            <Text allowFontScaling={false} style={[styles.tallyText, { color: sideTone('A').tone }]}>
              A ·{' '}
            </Text>
            <CountUp value={verdict.sideAScore} style={styles.tallyNum} />
          </View>
          <View style={styles.tallyItem}>
            <Text allowFontScaling={false} style={[styles.tallyText, { color: sideTone('B').tone }]}>
              B ·{' '}
            </Text>
            <CountUp value={verdict.sideBScore} style={styles.tallyNum} />
          </View>
        </View>
        {reputationDelta > 0 || coinsDelta > 0 ? (
          <Text allowFontScaling={false} style={styles.reward}>
            {reputationDelta > 0 ? `+${reputationDelta} reputation` : ''}
            {reputationDelta > 0 && coinsDelta > 0 ? ' · ' : ''}
            {coinsDelta > 0 ? `+${coinsDelta} coins` : ''}
          </Text>
        ) : null}
      </View>
    </FadeRise>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  winner: { ...typeScale.section, fontWeight: '800', letterSpacing: 0.4 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  pct: { ...typeScale.title, fontSize: 36, fontWeight: '800', letterSpacing: -0.8 },
  scoreMeta: { ...typeScale.meta, color: ink.secondary, flexShrink: 1 },
  label: { ...typeScale.meta, color: ink.secondary },
  barTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  barA: { backgroundColor: sideTone('A').tone, borderRadius: 3 },
  barB: { backgroundColor: sideTone('B').tone, borderRadius: 3 },
  tally: { flexDirection: 'row', gap: space.lg },
  tallyItem: { flexDirection: 'row', alignItems: 'baseline' },
  tallyText: { ...typeScale.data, fontSize: 13, fontWeight: '600' },
  tallyNum: { ...typeScale.data, fontSize: 13, fontWeight: '700', color: ink.primary },
  reward: { ...typeScale.label, color: ink.primary, fontWeight: '600', paddingTop: space.xs },
});
