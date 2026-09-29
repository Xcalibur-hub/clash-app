import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ServerVerdict } from '../../services/clashEngineService';
import { ink, space, typeScale } from '../../theme';
import { sideTone } from './duelPalette';

export interface ClashResultViewProps {
  verdict: ServerVerdict;
  /** Sum of the viewer's server reputation events for this Clash. */
  reputationDelta: number;
  coinsDelta: number;
}

/** The settled verdict — authoritative, calm, not an arcade victory screen. */
export function ClashResultView({ verdict, reputationDelta, coinsDelta }: ClashResultViewProps): React.JSX.Element {
  const winnerSide = verdict.winnerSide;
  const isDraw = winnerSide === 'DRAW';
  // A draw has no side tone — neutral ink, and neither side is named the winner.
  const tone = winnerSide === 'DRAW' ? ink.primary : sideTone(winnerSide).tone;
  const pct = verdict.jurySize > 0 ? Math.round(verdict.agreement * 100) : 0;
  const judgeWord = verdict.jurySize === 1 ? 'judge' : 'judges';
  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={[styles.winner, { color: tone }]}>
        {isDraw ? 'DRAW' : `SIDE ${winnerSide} WINS`}
      </Text>
      <Text allowFontScaling={false} style={styles.score}>
        {`${pct}% agreement · ${verdict.jurySize} ${judgeWord}`}
      </Text>
      {isDraw ? null : (
        <Text allowFontScaling={false} style={styles.label}>
          {verdict.verdictLabel}
        </Text>
      )}
      <View style={styles.tally}>
        <Text allowFontScaling={false} style={styles.tallyText}>
          Side A · {verdict.sideAScore}
        </Text>
        <Text allowFontScaling={false} style={styles.tallyText}>
          Side B · {verdict.sideBScore}
        </Text>
      </View>
      {reputationDelta > 0 || coinsDelta > 0 ? (
        <Text allowFontScaling={false} style={styles.reward}>
          {reputationDelta > 0 ? `+${reputationDelta} reputation` : ''}
          {reputationDelta > 0 && coinsDelta > 0 ? ' · ' : ''}
          {coinsDelta > 0 ? `+${coinsDelta} coins` : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, padding: space.md, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.03)' },
  winner: { ...typeScale.section, fontWeight: '700' },
  score: { ...typeScale.body, color: ink.primary },
  label: { ...typeScale.meta, color: ink.secondary },
  tally: { flexDirection: 'row', gap: space.lg, paddingTop: space.xs },
  tallyText: { ...typeScale.data, fontSize: 12, color: ink.tertiary },
  reward: { ...typeScale.label, color: ink.primary, fontWeight: '600', paddingTop: space.xs },
});
