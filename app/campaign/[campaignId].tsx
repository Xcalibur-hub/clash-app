import React from 'react';
import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CityDonut } from '../../components/vault/CityDonut';
import { CreatorRow } from '../../components/vault/CreatorRow';
import { vault as s } from '../../components/vault/vaultStyles';
import { Chip } from '../../components/shared/Chip';
import { EmptyState } from '../../components/shared/EmptyState';
import { GlassCard } from '../../components/shared/GlassCard';
import { Notice } from '../../components/shared/Notice';
import { SectionHeading } from '../../components/shared/SectionHeading';
import { RadarIcon } from '../../components/shared/icons';
import { conversionPct, gmvLakhs, SIMULATED_LABEL } from '../../data/mockCampaigns';
import { selectCampaign, selectCreator, useClash } from '../../store';
import { ink, radius, space, typeScale } from '../../theme';
import { compact } from '../../utils/format';
import { press as hapticPress } from '../../utils/haptics';


function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.stat}>
      <Text allowFontScaling={false} style={styles.statLabel}>{label}</Text>
      <Text allowFontScaling={false} style={styles.statValue}>{value}</Text>
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
      <View style={[s.root, styles.centerPad]}>
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <EmptyState
            icon={RadarIcon}
            title="Campaign not found."
            body="This radar blip faded. Pick another campaign from the Sponsor Radar."
            actionLabel="Back to radar"
            onAction={() => router.back()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
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
                <Chip label="‹ Back" tone="neutral" />
              </Pressable>
              <Chip label={campaign.status} tone={campaign.status === 'ACTIVE' ? 'mint' : 'neutral'} data />
            </View>
            <Text allowFontScaling={false} style={styles.eyebrow}>Regional influence</Text>
            <Text allowFontScaling={false} style={styles.title}>{campaign.code}</Text>
            <Text allowFontScaling={false} style={styles.sub}>
              Where your creator actually converts — {creator.name} · {campaign.period}.
            </Text>
            <View style={styles.grid}>
              <Stat label="Clicks" value={campaign.clicks.toLocaleString('en-IN')} />
              <Stat label="Redemptions" value={campaign.redemptions.toLocaleString('en-IN')} />
              <Stat label="Orders" value={campaign.orders.toLocaleString('en-IN')} />
              <Stat label="Est. GMV" value={gmvLakhs(campaign.gmv)} />
              <Stat label="Conversion" value={conversionPct(campaign)} />
              <Stat label="Creator" value={`@${creator.handle}`} />
            </View>
          </View>
        </GlassCard>

        <SectionHeading eyebrow="City distribution" title="Where orders land" />
        <GlassCard level="regular" corner={radius.xl}>
          <CityDonut cities={campaign.cities} orders={campaign.orders} />
        </GlassCard>

        <SectionHeading eyebrow="Premium insight" title="Advanced geo attribution" />
        <CreatorRow
          title="Advanced geo attribution"
          sub="City-level attribution · regional performance · exports"
          value="Unlock"
          onPress={() => {
            hapticPress();
            router.push('/(vault)/analytics');
          }}
        />
        <Text allowFontScaling={false} style={styles.sim}>{SIMULATED_LABEL} · {compact(campaign.orders)} mock orders</Text>
      </ScrollView>
      <Notice offset={0} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backChip: { alignSelf: 'flex-start' },
  center: { flex: 1, paddingHorizontal: space.lg, justifyContent: 'center' },
  centerPad: { flexGrow: 1 },
  eyebrow: { ...typeScale.meta, color: ink.tertiary },
  title: { ...typeScale.title, color: ink.primary },
  sub: { ...typeScale.body, color: ink.secondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: { minWidth: '30%', flexGrow: 1, gap: 2 },
  statLabel: { ...typeScale.meta, fontSize: 12, color: ink.tertiary, fontWeight: '400' },
  statValue: { ...typeScale.dataLg, fontSize: 16, color: ink.primary },
  sim: { ...typeScale.meta, color: ink.tertiary },
});
