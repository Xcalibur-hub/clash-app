import { communityVerdictCopy } from '../../../utils/communityVerdict';
/**
 * Shareable Clash result — editorial share sheet (text-first).
 */
import React from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';
import type { ServerVerdict } from '../../../services/clashEngineService';
import type { Side } from '../../../store';
import { space, typeScale, useThemeColors } from '../../../theme';
import { GlowButton } from '../../shared/GlowButton';
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
  const dark = t.scheme === 'dark';
  const fill = isDraw
    ? (dark ? '#423C4A' : '#FFE5A0')
    : verdict.winnerSide === 'A'
      ? (dark ? '#47375D' : '#E8D9FF')
      : (dark ? '#60434B' : '#FFD6C1');
  const ink = dark ? '#FFF8F2' : '#241C29';
  const mutedInk = dark ? '#E9D9E8' : '#655368';

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
    const message = `CLASH — ${headline}\n${matchup}\n${communityVerdictCopy(verdict)}${ballot}\n\nJudge on CLASH.`;
    try {
      await Share.share({ message });
      analytics.track('clash_result_shared', { realm: 'arena' });
    } catch {
      /* user dismissed */
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: fill }]}>
      <Text allowFontScaling={true} style={[styles.brand, { color: mutedInk }]}>
        CLASH  /  THE FINAL WORD
      </Text>
      <Text allowFontScaling style={[styles.headline, { color: ink }]}>
        {isDraw ? 'A DRAW.' : `SIDE ${verdict.winnerSide}\nWINS.`}
      </Text>
      <Text allowFontScaling style={[styles.meta, { color: mutedInk }]} numberOfLines={3}>
        {blindHidden ? 'Blind Clash result' : `${sideAText}  ·  ${sideBText}`}
      </Text>
      <Text allowFontScaling={true} style={[styles.stats, { color: ink }]}>
        {pct}% · {verdict.jurySize.toLocaleString('en-IN')} judgments
      </Text>
      {myBallot ? (
        <Text allowFontScaling={true} style={[styles.ballot, { color: mutedInk }]}>
          You backed Side {myBallot}
        </Text>
      ) : null}
      <GlowButton label="Share result" onPress={() => void onShare()} compact tone="glass" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: 24,
    borderRadius: 28,
    overflow: 'hidden',
  },
  brand: {
    ...typeScale.caption,
    letterSpacing: 1.4,
    fontWeight: '900',
  },
  headline: {
    ...typeScale.title,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -1.1,
    fontWeight: '900',
  },
  meta: { ...typeScale.meta },
  stats: { ...typeScale.label, fontWeight: '700' },
  ballot: { ...typeScale.caption },
});
