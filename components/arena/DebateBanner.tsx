import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { accent, ink, space, typeScale } from '../../theme';
import { timeLeftLabel } from '../../utils/format';

export interface DebateBannerProps {
  expiresAt: number;
  now: number;
}

/** Countdown banner: LIVE DEBATE with the final-judgement clock, or VERDICT SETTLED. */
export function DebateBanner({ expiresAt, now }: DebateBannerProps): React.JSX.Element {
  const live = expiresAt > now;
  const label = live ? timeLeftLabel(expiresAt, now).replace(' left', '') : '';
  return (
    <View style={[styles.banner, live ? styles.live : styles.settled]}>
      <Text
        allowFontScaling={false}
        style={[styles.text, live ? styles.liveText : styles.settledText]}
        accessibilityLabel={live ? `Live debate, final judgement in ${label}` : 'Verdict settled'}
      >
        {live ? `\u23F3 LIVE DEBATE \u00B7 FINAL JUDGEMENT IN ${label}` : 'VERDICT SETTLED'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  live: {
    borderColor: 'rgba(255,200,97,0.35)',
    backgroundColor: 'rgba(255,200,97,0.08)',
  },
  settled: {
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  text: { ...typeScale.caption, fontSize: 11 },
  liveText: { color: accent.gold },
  settledText: { color: ink.tertiary },
});
