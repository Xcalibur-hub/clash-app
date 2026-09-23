import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Hood } from '../../store';
import { card, ink, radius, space, typeScale } from '../../theme';
import { formatReputation } from '../../utils/format';

export interface HoodRowProps {
  position: number;
  hood: Hood;
}

/** One hood on the Hall of Fame hoods leaderboard. */
export function HoodRow({ position, hood }: HoodRowProps): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text allowFontScaling={false} style={styles.position}>
        {`#${String(position).padStart(2, '0')}`}
      </Text>
      <View style={styles.info}>
        <Text allowFontScaling={false} style={styles.name} numberOfLines={1}>
          {hood.name}
        </Text>
        <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
          {hood.tagline}
        </Text>
      </View>
      <View style={styles.stat}>
        <Text allowFontScaling={false} style={styles.value}>
          {formatReputation(hood.members)}
        </Text>
        <Text allowFontScaling={false} style={styles.label}>
          MEMBERS
        </Text>
      </View>
      <View style={styles.stat}>
        <Text allowFontScaling={false} style={styles.value}>
          {String(hood.liveClashes)}
        </Text>
        <Text allowFontScaling={false} style={styles.label}>
          LIVE
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    marginBottom: space.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: card.border,
    backgroundColor: card.solid,
  },
  position: { ...typeScale.data, fontSize: 12, color: ink.quaternary },
  info: { flex: 1, gap: 1 },
  name: { ...typeScale.label, color: ink.primary, fontWeight: '700' },
  meta: { ...typeScale.meta, color: ink.tertiary },
  stat: { alignItems: 'flex-end', gap: 1 },
  value: { ...typeScale.data, fontSize: 12, color: ink.primary },
  label: { ...typeScale.caption, fontSize: 8, letterSpacing: 1, color: ink.quaternary },
});
