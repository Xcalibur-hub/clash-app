import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WinEntry } from '../../store';
import { accent, ink, radius, space, tint, typeScale } from '../../theme';
import { Chip } from '../shared/Chip';
import { GlassCard } from '../shared/GlassCard';
import { ChevronIcon, CoinIcon, TrophyIcon, ZapIcon } from '../shared/icons';

export interface WinCardProps {
  entry: WinEntry;
  winnerHandle: string;
  onPress: () => void;
}

/** A clash the viewer called correctly — the Profile "Wins" tab. */
export function WinCard({ entry, winnerHandle, onPress }: WinCardProps): React.JSX.Element {
  const sideTone = entry.result.winningSide === 'A' ? 'a' : 'b';
  const sideColor = entry.result.winningSide === 'A' ? accent.a : accent.b;
  const sideSoft = entry.result.winningSide === 'A' ? tint.aSoft : tint.bSoft;

  return (
    <GlassCard
      level="soft"
      corner={20}
      onPress={onPress}
      contentStyle={styles.content}
      accessibilityLabel={`Won clash: ${entry.take.text}`}
      accessibilityHint="Reopens this clash"
    >
      <View style={styles.head}>
        <View style={[styles.ribbon, { backgroundColor: sideSoft, borderColor: sideColor }]}>
          <TrophyIcon size={13} color={sideColor} strokeWidth={2.4} />
          <Text allowFontScaling={false} style={[styles.ribbonText, { color: sideColor }]}>
            {`TAKE ${entry.result.winningSide} WON · ${entry.result.score.a}—${entry.result.score.b}`}
          </Text>
        </View>
        <ChevronIcon size={16} color={ink.quaternary} strokeWidth={2.4} />
      </View>

      <Text allowFontScaling={false} style={styles.text} numberOfLines={2}>
        {entry.take.text}
      </Text>
      <Text allowFontScaling={false} style={styles.handle}>{`@${winnerHandle}`}</Text>

      <View style={styles.rewards}>
        <Chip label={`${entry.result.verdict}`} tone={sideTone === 'a' ? 'a' : 'b'} />
        <View style={styles.reward}>
          <ZapIcon size={12} color={accent.violet} strokeWidth={2.6} />
          <Text allowFontScaling={false} style={styles.rewardText}>
            {`+${entry.result.reputation} REP`}
          </Text>
        </View>
        <View style={styles.reward}>
          <CoinIcon size={12} color={accent.gold} strokeWidth={2.6} />
          <Text allowFontScaling={false} style={styles.rewardText}>
            {`+${entry.result.coins}`}
          </Text>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.sm + 2, padding: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 1,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  ribbonText: { ...typeScale.caption, fontSize: 10 },
  text: { ...typeScale.cardTitle, color: ink.primary },
  handle: { ...typeScale.meta, color: ink.tertiary },
  rewards: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', marginTop: space.xs },
  reward: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rewardText: { ...typeScale.data, fontSize: 11, color: ink.secondary },
});
