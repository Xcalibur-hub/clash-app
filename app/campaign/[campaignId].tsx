import React from 'react';
import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CityDonut } from '../../components/vault/CityDonut';
import { CreatorRow } from '../../components/vault/CreatorRow';
import { vault as s } from '../../components/vault/vaultStyles';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { Chip } from '../../components/shared/Chip';
import { EmptyState } from '../../components/shared/EmptyState';
import { GlassCard } from '../../components/shared/GlassCard';
import { Notice } from '../../components/shared/Notice';
import { SectionHeading } from '../../components/shared/SectionHeading';
import { BackIcon, RadarIcon } from '../../components/shared/icons';
import { conversionPct, gmvLakhs, SIMULATED_LABEL } from '../../data/mockCampaigns';
import { selectCampaign, selectCreator, useClash } from '../../store';
import { accent, ink, radius, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { press as hapticPress } from '../../utils/haptics';


function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }): React.JSX.Element {
  return (
    <View style={styles.stat}>
      <Text allowFontScaling={false} style={styles.statLabel}>{label}</Text>
      <Text allowFontScaling={false} style={[styles.statValue, gold && { color: accent.gold }]}>{value}</Text>
    </View>
  );
}

/** REGIONAL INFLUENCE (spec §21): city distribution, orders, redemptions. */
export default function CampaignScreen(): React.JSX.Element {
  const { campaignId } = useLocalSearchParams<{ campaignId?: string }>();
  const { state } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const campaign = selectCampaign(state, String(campaignId));
  const creator = selectCreator(state, campaign?.creatorId ?? '');

  if (!campaign || !creator) {
    return (
      <AuroraBackground tone="calm" doodles={false}>
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <EmptyState
            icon={RadarIcon}
            title="Campaign not found."
            body="This radar blip faded. Pick another campaign from the Sponsor Radar."
            actionLabel="BACK TO RADAR"
            onAction={() => router.back()}
          />
        </View>
      </AuroraBackground>
    );
  }

  return (
    <AuroraBackground tone="calm" doodles={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingTop: insets.top + space.md }]}
      >
        <GlassCard level="regular" corner={radius.xl}>
          <View style={styles.wrap}>
            <View style={styles.topRow}>
              <Pressable
                onPress={() => {
                  hapticPress();
                  router.back();
                }}
                accessibilityRole="button"
                accessibilityLabel="Go back to the Sponsor Radar"
                style={styles.backChip}
              >
                <Chip label="‹ BACK" tone="neutral" />
              </Pressable>
              <Chip label={campaign.status} tone={campaign.status === 'ACTIVE' ? 'mint' : 'neutral'} data />
            </View>
            <Text allowFontScaling={false} style={styles.eyebrow}>REGIONAL INFLUENCE</Text>
            <Text allowFontScaling={false} style={styles.title}>{campaign.code}</Text>
            <Text allowFontScaling={false} style={styles.sub}>
              Where your creator actually converts — {creator.name} · {campaign.period}.
            </Text>
            <View style={styles.grid}>
              <Stat label="CLICKS" value={campaign.clicks.toLocaleString('en-IN')} />
              <Stat label="REDEMPTIONS" value={campaign.redemptions.toLocaleString('en-IN')} />
              <Stat label="ORDERS" value={campaign.orders.toLocaleString('en-IN')} />
              <Stat label="EST. GMV" value={gmvLakhs(campaign.gmv)} gold />
              <Stat label="CONVERSION" value={conversionPct(campaign)} gold />
              <Stat label="CREATOR" value={`@${creator.handle}`} />
            </View>
          </View>
        </GlassCard>

        <SectionHeading eyebrow="CITY DISTRIBUTION" title="Where orders land" />
        <GlassCard level="regular" corner={radius.xl}>
          <CityDonut cities={campaign.cities} orders={campaign.orders} />
        </GlassCard>

        <SectionHeading eyebrow="PREMIUM INSIGHT" title="Advanced geo attribution" />
        <CreatorRow
          title="ADVANCED GEO ATTRIBUTION"
          sub="City-level attribution · regional performance · exports"
          value="UNLOCK"
          onPress={() => {
            hapticPress();
            router.push('/(vault)/analytics');
          }}
        />
        <Text allowFontScaling={false} style={styles.sim}>{SIMULATED_LABEL} · {compact(campaign.orders)} mock orders</Text>
      </ScrollView>
      <Notice offset={0} />
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backChip: { alignSelf: 'flex-start' },
  center: { flex: 1, paddingHorizontal: space.lg, justifyContent: 'center' },
  eyebrow: { ...typeScale.caption, color: accent.gold },
  title: { ...typeScale.title, color: ink.primary },
  sub: { ...typeScale.body, color: ink.secondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: { minWidth: '30%', flexGrow: 1, gap: 2 },
  statLabel: { ...typeScale.caption, fontSize: 10, color: ink.tertiary },
  statValue: { ...typeScale.dataLg, fontSize: 16, color: ink.primary },
  sim: { ...typeScale.meta, color: ink.tertiary },
});
