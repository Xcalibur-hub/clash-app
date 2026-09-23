import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { XpEvent } from '../../store';
import { accent, ink, space, typeScale } from '../../theme';
import { CountUp } from '../shared/CountUp';

/**
 * The reputation ledger (spec §11). Showing where each point came from turns a
 * score into a system the user can reason about.
 */
export function RewardLedger({ events }: { events: readonly XpEvent[] }): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      {events.map((event, index) => (
        <Animated.View
          key={event.id}
          entering={FadeInDown.delay(260 + index * 110).duration(300)}
          style={styles.row}
        >
          <View style={styles.bullet} />
          <Text allowFontScaling={false} style={styles.label}>
            {event.label}
          </Text>
          <CountUp
            value={event.delta}
            prefix="+"
            delayMs={280 + index * 110}
            durationMs={520}
            style={styles.delta}
            accessibilityLabel={`${event.label}: plus ${event.delta} reputation`}
          />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs + 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: accent.violet,
  },
  label: { ...typeScale.meta, color: ink.secondary, flex: 1 },
  delta: { ...typeScale.data, color: ink.primary },
});
