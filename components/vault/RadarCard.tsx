import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '../shared/GlassCard';
import { Chip } from '../shared/Chip';
import { StoreIcon } from '../shared/icons';
import { accent, ink, radius, space, typeScale } from '../../theme';
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

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }): React.JSX.Element {
  return (
    <View style={styles.stat}>
      <Text allowFontScaling={false} style={styles.statLabel}>{label}</Text>
      <Text allowFontScaling={false} style={[styles.statValue, gold && { color: accent.gold }]}>{value}</Text>
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
          <View>
            <Text allowFontScaling={false} style={styles.eyebrow}>SPONSOR RADAR</Text>
            <Text allowFontScaling={false} style={styles.code}>{campaign.code}</Text>
          </View>
          <Chip label={campaign.status} tone={campaign.status === 'ACTIVE' ? 'mint' : 'neutral'} data />
        </View>
        <View style={styles.sponsorRow}>
          <StoreIcon size={14} color={accent.violet} strokeWidth={2.4} />
          <Text allowFontScaling={false} style={styles.sponsor}>
            {campaign.sponsor} × {creator ? atHandle(creator.handle) : 'creator'}
          </Text>
        </View>
        <View style={styles.grid}>
          <Stat label="CLICKS" value={campaign.clicks.toLocaleString('en-IN')} />
          <Stat label="REDEMPTIONS" value={campaign.redemptions.toLocaleString('en-IN')} />
          <Stat label="ORDERS" value={campaign.orders.toLocaleString('en-IN')} />
          <Stat label="EST. GMV" value={gmvLakhs(campaign.gmv)} gold />
          <Stat label="CONVERSION" value={conversionPct(campaign)} gold />
          <Stat label="PERIOD" value={campaign.period} />
        </View>
        <Text allowFontScaling={false} style={styles.cities}>TOP CITIES</Text>
        <CityDonut cities={campaign.cities} orders={campaign.orders} />
        <Text allowFontScaling={false} style={styles.link}>OPEN ATTRIBUTION →</Text>
        <Chip label={SIMULATED_LABEL} tone="neutral" style={styles.sim} />
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  eyebrow: { ...typeScale.caption, color: ink.tertiary },
  code: { ...typeScale.section, color: ink.primary },
  sponsorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  sponsor: { ...typeScale.label, color: ink.secondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stat: { minWidth: '30%', flexGrow: 1, gap: 2 },
  statLabel: { ...typeScale.caption, fontSize: 10, color: ink.tertiary },
  statValue: { ...typeScale.dataLg, fontSize: 16, color: ink.primary },
  cities: { ...typeScale.caption, color: ink.tertiary },
  link: { ...typeScale.label, color: accent.gold },
  sim: { alignSelf: 'flex-start' },
});
