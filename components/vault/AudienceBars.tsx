import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CityShare } from '../../store/types';
import { card, ink, radius, space, typeScale } from '../../theme';

/**
 * Top-city audience bars (§21): thin neutral tracks, percentage on the right —
 * Linear-style data rows instead of decorative charts.
 */
export function AudienceBars({ shares }: { shares: readonly CityShare[] }): React.JSX.Element {
  return (
    <View style={styles.card}>
      {shares.map((share) => (
        <View key={share.city} style={styles.row}>
          <Text allowFontScaling={false} style={styles.city}>{share.city}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${share.share}%` }]} />
          </View>
          <Text allowFontScaling={false} style={styles.pct}>{share.share}%</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: card.solid,
    borderWidth: 1,
    borderColor: card.border,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  city: { ...typeScale.body, color: ink.primary, width: 84 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.82)' },
  pct: { ...typeScale.data, color: ink.secondary, width: 40, textAlign: 'right' },
});