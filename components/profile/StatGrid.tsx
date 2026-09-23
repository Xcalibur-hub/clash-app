import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { User } from '../../store';
import { accent, ink, radius, space, typeScale } from '../../theme';
import { formatReputation } from '../../utils/format';
import { GlassCard } from '../shared/GlassCard';

interface Stat {
  label: string;
  value: string;
  tone: string;
}

/** The four numbers the reference puts on a profile (screen 13). */
function statList(viewer: User): Stat[] {
  const winRate = viewer.clashes > 0 ? Math.round((viewer.wins / viewer.clashes) * 100) : 0;
  return [
    { label: 'REPUTATION', value: formatReputation(viewer.reputation), tone: accent.gold },
    { label: 'CLASHES', value: String(viewer.clashes), tone: ink.primary },
    { label: 'WINS', value: String(viewer.wins), tone: accent.mint },
    { label: 'WIN RATE', value: `${winRate}%`, tone: accent.b },
  ];
}

/** Career stats as one 2×2 box. */
export function StatGrid({ viewer }: { viewer: User }): React.JSX.Element {
  return (
    <GlassCard level="soft" corner={radius.card} contentStyle={styles.grid}>
      {statList(viewer).map((stat) => (
        <View key={stat.label} style={styles.cell}>
          <Text allowFontScaling={false} style={[styles.value, { color: stat.tone }]}>
            {stat.value}
          </Text>
          <Text allowFontScaling={false} style={styles.label}>
            {stat.label}
          </Text>
        </View>
      ))}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: space.lg,
    rowGap: space.lg,
    columnGap: space.sm,
  },
  cell: { flexBasis: '45%', flexGrow: 1, gap: 2 },
  value: { ...typeScale.dataLg, fontSize: 20, lineHeight: 25 },
  label: { ...typeScale.caption, fontSize: 9, letterSpacing: 1.2, color: ink.quaternary },
});
