import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { card, ink, radius, space, typeScale } from '../../theme';

export interface HeroStat {
  label: string;
  value: string;
}

export interface VaultHeroProps {
  value: string;
  label: string;
  stats: readonly HeroStat[];
}

/**
 * Attributed-GMV hero (§21): one headline number with quiet supporting stats —
 * the dashboard's single moment of scale, everything else stays flat.
 */
export function VaultHero({ value, label, stats }: VaultHeroProps): React.JSX.Element {
  return (
    <View style={styles.hero}>
      <Text allowFontScaling={false} style={styles.value}>{value}</Text>
      <Text allowFontScaling={false} style={styles.label}>{label}</Text>
      <View style={styles.stats}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Text allowFontScaling={false} style={styles.statValue}>{stat.value}</Text>
            <Text allowFontScaling={false} style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: card.solid,
    borderWidth: 1,
    borderColor: card.border,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.xs,
  },
  value: { ...typeScale.display, color: ink.primary },
  label: { ...typeScale.meta, color: ink.tertiary },
  stats: { flexDirection: 'row', gap: space.xl, marginTop: space.md },
  stat: { flex: 1, gap: 2 },
  statValue: { ...typeScale.dataLg, fontSize: 15, color: ink.primary },
  statLabel: { ...typeScale.meta, fontSize: 12, color: ink.tertiary },
});