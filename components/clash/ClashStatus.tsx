import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ink, radius, space, typeScale } from '../../theme';
import { durationLabel } from '../../utils/format';

export type ClashStatusKind = 'open' | 'closed' | 'settled' | 'cancelled';

export interface ClashStatusProps {
  kind: ClashStatusKind;
  closesAt: number;
  now: number;
}

/** Compact status line for the Clash: open countdown, closed, settled or cancelled. */
export function ClashStatus({ kind, closesAt, now }: ClashStatusProps): React.JSX.Element {
  const label =
    kind === 'open'
      ? `Closes in ${durationLabel(closesAt, now)}`
      : kind === 'closed'
        ? 'Judging closed · result pending'
        : kind === 'settled'
          ? 'Settled'
          : 'No community verdict';
  return (
    <View style={styles.wrap}>
      <Text allowFontScaling={false} style={styles.label} accessibilityLiveRegion="polite">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.03)' },
  label: { ...typeScale.meta, fontSize: 12, color: ink.secondary },
});
