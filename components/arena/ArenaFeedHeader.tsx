import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArenaBalance, ArenaHeader } from './ArenaHeader';
import { HoodSelector } from './HoodSelector';
import { Chip } from '../shared/Chip';
import { SectionHeading } from '../shared/SectionHeading';
import { HOOD_LABEL } from '../../data/hoods';
import type { HoodId } from '../../store';
import { ink, layout, space, typeScale } from '../../theme';

export interface ArenaFeedHeaderProps {
  hood: HoodId;
  liveCount: number;
  onChangeHood: (hood: HoodId) => void;
}

/**
 * Masthead → hood pills → editorial feed title (reference "Arena Home", screen 5).
 * Pinned above the FlatList data.
 */
export function ArenaFeedHeader({
  hood,
  liveCount,
  onChangeHood,
}: ArenaFeedHeaderProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <ArenaHeader />
      <HoodSelector value={hood} onChange={onChangeHood} />
      <SectionHeading
        eyebrow={`${HOOD_LABEL[hood].toUpperCase()} · LIVE`}
        title="Today's Takes"
        editorial
        marked
        accessory={<Chip label={`${liveCount} LIVE`} tone="a" data />}
      />
      <View style={styles.metaRow}>
        <Text allowFontScaling={false} style={styles.note}>
          Every take dies in 24 hours.
        </Text>
        <ArenaBalance />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg, paddingBottom: layout.feedGap },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  note: { ...typeScale.meta, color: ink.tertiary, flexShrink: 1 },
});
