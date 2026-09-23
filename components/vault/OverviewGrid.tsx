/** Sponsor overview KPI grid (spec §22): revenue/orders/conversions/top. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '../shared/GlassCard';
import { gmvLakhs } from '../../data/mockCampaigns';
import { CREATOR_BY_ID } from '../../data/mockCreators';
import type { SponsorOverview } from '../../services/vaultService';
import type { Creator } from '../../store/types';
import { accent, ink, radius, space, typeScale } from '../../theme';
import { atHandle } from '../../utils/format';

export interface OverviewGridProps {
  overview: SponsorOverview;
  creators: readonly Creator[];
}

export function OverviewGrid({ overview, creators }: OverviewGridProps): React.JSX.Element {
  const top = creators.find((c) => c.id === overview.topCreatorId) ?? CREATOR_BY_ID[overview.topCreatorId];
  const cells: Array<{ label: string; value: string; gold?: boolean }> = [
    { label: 'REVENUE', value: gmvLakhs(overview.revenue), gold: true },
    { label: 'ORDERS', value: overview.orders.toLocaleString('en-IN') },
    { label: 'CONVERSIONS', value: overview.redemptions.toLocaleString('en-IN') },
    { label: 'RATE', value: overview.conversion, gold: true },
    { label: 'TOP CREATOR', value: top ? atHandle(top.handle) : '—' },
    { label: 'TOP CITY', value: overview.topCity },
  ];
  return (
    <View style={styles.grid}>
      {cells.map((cell) => (
        <GlassCard key={cell.label} level="soft" corner={radius.lg} style={styles.cell}>
          <Text allowFontScaling={false} style={styles.label}>{cell.label}</Text>
          <Text allowFontScaling={false} style={[styles.value, cell.gold && { color: accent.gold }]} numberOfLines={1}>
            {cell.value}
          </Text>
        </GlassCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { minWidth: '30%', flexGrow: 1 },
  label: { ...typeScale.caption, fontSize: 10, color: ink.tertiary },
  value: { ...typeScale.dataLg, fontSize: 15, color: ink.primary },
});