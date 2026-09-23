import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { accent, gradient, ink, radius, space, typeScale } from '../../theme';
import { formatReputation } from '../../utils/format';
import { rankProgress } from '../../utils/reputation';

/**
 * "NEXT RANK" progress bar (reference screen 13): the viewer's total reputation
 * against the threshold of the rank they are climbing toward — "8,420 / 11,000 XP".
 */
export function ReputationBar({ reputation }: { reputation: number }): React.JSX.Element {
  const { current, next, ratio, toNext } = rankProgress(reputation);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text allowFontScaling={false} style={styles.label}>
          NEXT RANK
        </Text>
        <Text allowFontScaling={false} style={styles.next}>
          {next ? next.name.toUpperCase() : 'MAX RANK'}
        </Text>
      </View>

      <View style={styles.track}>
        <LinearGradient
          colors={gradient.gold}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${Math.max(ratio * 100, 3)}%` }]}
        />
      </View>

      <View style={styles.foot}>
        <Text allowFontScaling={false} style={styles.xp}>
          {next
            ? `${formatReputation(reputation)} / ${formatReputation(next.min)} XP`
            : `${formatReputation(reputation)} XP`}
        </Text>
        <Text allowFontScaling={false} style={styles.caption}>
          {next ? `${formatReputation(toNext)} to go` : current.blurb}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { ...typeScale.caption, color: ink.secondary },
  next: { ...typeScale.caption, color: accent.gold },
  track: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  fill: { height: 10, borderRadius: radius.pill },
  foot: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  xp: { ...typeScale.data, fontSize: 12, color: ink.primary },
  caption: { ...typeScale.meta, color: ink.quaternary },
});
