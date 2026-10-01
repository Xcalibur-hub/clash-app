/**
 * Shareable Clash result — editorial share sheet (text-first).
 */
import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import type { ServerVerdict } from '../../../services/clashEngineService';
import type { Side } from '../../../store';
import { radius, space, typeScale, useThemeColors } from '../../../theme';
import { GlowButton } from '../../shared/GlowButton';
import { sideTone } from '../duelPalette';
import { analytics } from '../../../services/analytics';
import { tap as hapticTap } from '../../../utils/haptics';

export interface ClashResultShareProps {
  sideAText: string;
  sideBText: string;
  verdict: ServerVerdict;
  myBallot: Side | null;
  blindHidden: boolean;
}

export function ClashResultShare({
  sideAText,
  sideBText,
  verdict,
  myBallot,
  blindHidden,
}: ClashResultShareProps): React.JSX.Element {
  const t = useThemeColors();
  const isDraw = verdict.winnerSide === 'DRAW';
  const pct = verdict.jurySize > 0 ? Math.round(verdict.agreement * 1000) / 10 : 0;
  const tone = isDraw
    ? t.textPrimary
    : sideTone(verdict.winnerSide === 'A' ? 'A' : 'B').tone;

  const onShare = async (): Promise<void> => {
    hapticTap();
    const headline = isDraw ? 'DRAW' : `SIDE ${verdict.winnerSide} WINS`;
    const matchup = blindHidden
      ? 'Blind Clash'
      : `"${sideAText.slice(0, 80)}" vs "${sideBText.slice(0, 80)}"`;
    const ballot =
      myBallot && !isDraw
        ? `\nI backed Side ${myBallot}.`
        : myBallot
          ? `\nI judged Side ${myBallot}.`
          : '';
    const message = `CLASH — ${headline}\n${matchup}\n${pct}% · ${verdict.jurySize} judgments${ballot}\n\nJudge on CLASH.`;
    try {
      await Share.share({ message });
      analytics.track('clash_result_shared', { realm: 'arena' });
    } catch {
      /* user dismissed */
    }
  };

  return (
    <View style={[styles.card, { borderColor: t.border, backgroundColor: t.surface }]}>
      <Text allowFontScaling={false} style={[styles.brand, { color: t.textMuted }]}>
        CLASH
      </Text>
      <Text allowFontScaling={false} style={[styles.headline, { color: tone }]}>
        {isDraw ? 'Draw' : `Side ${verdict.winnerSide} wins`}
      </Text>
      <Text allowFontScaling={false} style={[styles.meta, { color: t.textSecondary }]} numberOfLines={3}>
        {blindHidden ? 'Blind Clash result' : `${sideAText}  ·  ${sideBText}`}
      </Text>
      <Text allowFontScaling={false} style={[styles.stats, { color: t.textPrimary }]}>
        {pct}% · {verdict.jurySize.toLocaleString('en-IN')} judgments
      </Text>
      {myBallot ? (
        <Text allowFontScaling={false} style={[styles.ballot, { color: t.textMuted }]}>
          You backed Side {myBallot}
        </Text>
      ) : null}
      <GlowButton label="Share result" onPress={() => void onShare()} compact tone="glass" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  brand: {
    ...typeScale.caption,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  headline: { ...typeScale.title, fontWeight: '700' },
  meta: { ...typeScale.meta },
  stats: { ...typeScale.label, fontWeight: '700' },
  ballot: { ...typeScale.caption },
});
