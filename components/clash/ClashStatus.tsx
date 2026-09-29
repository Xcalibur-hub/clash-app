import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { accent, ink, radius, space, typeScale } from '../../theme';
import { durationLabel } from '../../utils/format';

export type ClashStatusKind = 'open' | 'closed' | 'settled' | 'cancelled';

export interface ClashStatusProps {
  kind: ClashStatusKind;
  closesAt: number;
  now: number;
}

/** Compact status line for the Clash: open countdown, closed, settled or cancelled. */
export function ClashStatus({ kind, closesAt, now }: ClashStatusProps): React.JSX.Element {
  const open = kind === 'open';
  const label =
    open
      ? `Closes in ${durationLabel(closesAt, now)}`
      : kind === 'closed'
        ? 'Judging closed · result pending'
        : kind === 'settled'
          ? 'Settled'
          : 'No community verdict';
  return (
    <View style={[styles.wrap, open && styles.open, kind === 'settled' && styles.settled]}>
      <Text
        allowFontScaling={false}
        style={[styles.label, open && styles.labelOpen]}
        accessibilityLiveRegion="polite"
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  open: {
    borderColor: 'rgba(201,169,106,0.35)',
    backgroundColor: 'rgba(201,169,106,0.08)',
  },
  settled: {
    borderColor: 'rgba(255,255,255,0.14)',
  },
  label: { ...typeScale.meta, fontSize: 12, color: ink.secondary, fontVariant: ['tabular-nums'] },
  labelOpen: { color: accent.gold, fontWeight: '600' },
});
