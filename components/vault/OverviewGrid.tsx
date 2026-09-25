/** Sponsor overview KPI grid (§22): revenue/orders/conversions/top — one quiet plate. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '../shared/GlassCard';
import { gmvLakhs } from '../../data/mockCampaigns';
import { CREATOR_BY_ID } from '../../data/mockCreators';
import type { SponsorOverview } from '../../services/vaultService';
import type { Creator } from '../../store/types';
import { ink, radius, space, typeScale } from '../../theme';
import { atHandle } from '../../utils/format';

export interface OverviewGridProps {
  overview: SponsorOverview;
  creators: readonly Creator[];
}

export function OverviewGrid({ overview, creators }: OverviewGridProps): React.JSX.Element {
  const top = creators.find((c) => c.id === overview.topCreatorId) ?? CREATOR_BY_ID[overview.topCreatorId];
  const cells: { label: string; value: string }[] = [
    { label: 'Revenue', value: gmvLakhs(overview.revenue) },
    { label: 'Orders', value: overview.orders.toLocaleString('en-IN') },
    { label: 'Conversions', value: overview.redemptions.toLocaleString('en-IN') },
    { label: 'Rate', value: overview.conversion },
    { label: 'Top creator', value: top ? atHandle(top.handle) : '—' },
    { label: 'Top city', value: overview.topCity },
  ];
  return (
    <View style={styles.grid}>
      {cells.map((cell) => (
        <GlassCard key={cell.label} level="soft" corner={radius.lg} style={styles.cell}>
          <Text allowFontScaling={false} style={styles.label}>{cell.label}</Text>
          <Text allowFontScaling={false} style={styles.value} numberOfLines={1}>
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
  label: { ...typeScale.meta, fontSize: 12, color: ink.tertiary, fontWeight: '400' },
  value: { ...typeScale.dataLg, fontSize: 15, color: ink.primary },
});