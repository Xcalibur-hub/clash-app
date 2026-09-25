import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '../shared/GlassCard';
import { Chip } from '../shared/Chip';
import { StoreIcon } from '../shared/icons';
import { ink, radius, space, typeScale } from '../../theme';
import { CityDonut } from './CityDonut';
import { conversionPct, gmvLakhs, SIMULATED_LABEL } from '../../data/mockCampaigns';
import type { Campaign, Creator } from '../../store/types';
import { atHandle } from '../../utils/format';
import { press as hapticPress } from '../../utils/haptics';

export interface RadarCardProps {
  campaign: Campaign;
  creator: Creator | undefined;
  onOpen: () => void;
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.stat}>
      <Text allowFontScaling={false} style={styles.statLabel}>{label}</Text>
      <Text allowFontScaling={false} style={styles.statValue}>{value}</Text>
    </View>
  );
}

/** Sponsor Radar card (§20): hero NOVOCAINE20 metrics + city donut. */
export function RadarCard({ campaign, creator, onOpen }: RadarCardProps): React.JSX.Element {
  return (
    <GlassCard
      onPress={() => { hapticPress(); onOpen(); }}
      corner={radius.xl}
      accessibilityLabel={`Open campaign ${campaign.code}`}
    >
      <View style={styles.wrap}>
        <View style={styles.top}>
          <Text allowFontScaling={false} style={styles.code}>{campaign.code}</Text>
          <Chip label={campaign.status} tone={campaign.status === 'ACTIVE' ? 'mint' : 'neutral'} data />
        </View>
        <View style={styles.sponsorRow}>
          <StoreIcon size={14} color={campaign.sponsorTint} strokeWidth={2.4} />
          <Text allowFontScaling={false} style={styles.sponsor}>
            {campaign.sponsor} × {creator ? atHandle(creator.handle) : 'creator'}
          </Text>
        </View>
        <View style={styles.grid}>
          <Stat label="Clicks" value={campaign.clicks.toLocaleString('en-IN')} />
          <Stat label="Redemptions" value={campaign.redemptions.toLocaleString('en-IN')} />
          <Stat label="Orders" value={campaign.orders.toLocaleString('en-IN')} />
          <Stat label="Est. GMV" value={gmvLakhs(campaign.gmv)} />
          <Stat label="Conversion" value={conversionPct(campaign)} />
          <Stat label="Period" value={campaign.period} />
        </View>
        <Text allowFontScaling={false} style={styles.cities}>Top cities</Text>
        <CityDonut cities={campaign.cities} orders={campaign.orders} />
        <Text allowFontScaling={false} style={styles.link}>Open attribution →</Text>
        <Chip label={SIMULATED_LABEL} tone="neutral" style={styles.sim} />
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  code: { ...typeScale.section, color: ink.primary, flexShrink: 1 },
  sponsorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  sponsor: { ...typeScale.label, color: ink.secondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stat: { minWidth: '30%', flexGrow: 1, gap: 2 },
  statLabel: { ...typeScale.meta, fontSize: 12, color: ink.tertiary, fontWeight: '400' },
  statValue: { ...typeScale.dataLg, fontSize: 16, color: ink.primary },
  cities: { ...typeScale.meta, fontSize: 12, color: ink.tertiary },
  link: { ...typeScale.label, color: ink.secondary },
  sim: { alignSelf: 'flex-start' },
});
