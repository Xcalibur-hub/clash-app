import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnalyticsPaywall } from '../../components/vault/AnalyticsPaywall';
import { CityDonut } from '../../components/vault/CityDonut';
import { CreatorRow } from '../../components/vault/CreatorRow';
import { OverviewGrid } from '../../components/vault/OverviewGrid';
import { VaultHeader } from '../../components/vault/VaultHeader';
import { sponsorRow, vault as s } from '../../components/vault/vaultStyles';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { Chip } from '../../components/shared/Chip';
import { GlassCard } from '../../components/shared/GlassCard';
import { GlowButton } from '../../components/shared/GlowButton';
import { Notice } from '../../components/shared/Notice';
import { SectionHeading } from '../../components/shared/SectionHeading';
import { AnalyticsIcon } from '../../components/shared/icons';
import { gmvLabel, SIMULATED_LABEL } from '../../data/mockCampaigns';
import { aggregateCities, sponsorOverview } from '../../services/vaultService';
import { selectCampaigns, selectCreators, setAnalytics, useClash } from '../../store';
import { accent, ink, radius, space, typeScale } from '../../theme';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';

/** Sponsor dashboard (spec §22) with the §21 premium geo paywall. */
export default function AnalyticsScreen(): React.JSX.Element {
  const { state, dispatch } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = React.useState<'overview' | 'campaigns' | 'creators' | 'attribution'>('overview');
  const [paywall, setPaywall] = React.useState(false);
  const campaigns = selectCampaigns(state);
  const creators = selectCreators(state);
  const overview = React.useMemo(() => sponsorOverview(campaigns), [campaigns]);
  const cities = React.useMemo(() => aggregateCities(campaigns), [campaigns]);
  const totalOrders = React.useMemo(() => campaigns.reduce((sum, c) => sum + c.orders, 0), [campaigns]);
  const ranked = React.useMemo(
    () =>
      [...creators].sort(
        (a, b) =>
          campaigns.filter((c) => c.creatorId === b.id).reduce((sum, c) => sum + c.gmv, 0) -
          campaigns.filter((c) => c.creatorId === a.id).reduce((sum, c) => sum + c.gmv, 0),
      ),
    [campaigns, creators],
  );

  return (
    <AuroraBackground tone="calm" doodles={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingTop: insets.top + space.md }]}
      >
        <VaultHeader title="ANALYTICS" subtitle="Sponsor dashboard." count={campaigns.length} />
        <View style={sponsorRow.tabs}>
          {(['overview', 'campaigns', 'creators', 'attribution'] as const).map((key) => (
            <Pressable
              key={key}
              onPress={() => {
                hapticTap();
                setTab(key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === key }}
              accessibilityLabel={`${key} tab`}
            >
              <Chip label={key.toUpperCase()} tone={tab === key ? 'gold' : 'neutral'} data />
            </Pressable>
          ))}
        </View>

        {tab === 'overview' ? (
          <>
            <OverviewGrid overview={overview} creators={creators} />
            <Text allowFontScaling={false} style={sponsorRow.sim}>{SIMULATED_LABEL}</Text>
          </>
        ) : null}

        {tab === 'campaigns' ? (
          <>
            <SectionHeading eyebrow="CAMPAIGNS" title="Spend, measured" />
            {campaigns.map((campaign) => (
              <CreatorRow
                key={campaign.id}
                title={`${campaign.code} · ${campaign.sponsor}`}
                sub={`${campaign.status} · ${campaign.period}`}
                value={gmvLabel(campaign.gmv)}
                onPress={() => router.push(`/campaign/${campaign.id}`)}
              />
            ))}
          </>
        ) : null}

        {tab === 'creators' ? (
          <>
            <SectionHeading eyebrow="CREATORS" title="Ranked by GMV" />
            {ranked.map((creator) => {
              const gmv = campaigns.filter((c) => c.creatorId === creator.id).reduce((sum, c) => sum + c.gmv, 0);
              return (
                <CreatorRow
                  key={creator.id}
                  title={`@${creator.handle}`}
                  sub={creator.name}
                  value={gmvLabel(gmv)}
                  onPress={() => router.push(`/creator/${creator.id}`)}
                />
              );
            })}
          </>
        ) : null}

        {tab === 'attribution' ? (
          state.analyticsUnlocked ? (
            <>
              <SectionHeading eyebrow="ADVANCED GEO ATTRIBUTION" title="City roll-up" />
              <GlassCard level="regular" corner={radius.xl}>
                <CityDonut cities={cities} orders={totalOrders} />
              </GlassCard>
              <Text allowFontScaling={false} style={sponsorRow.sim}>
                {`${SIMULATED_LABEL} · TOP CITY ${overview.topCity.toUpperCase()}`}
              </Text>
            </>
          ) : (
            <GlassCard level="regular" corner={radius.xl} contentStyle={styles.locked}>
              <Text allowFontScaling={false} style={styles.lockedTitle}>ADVANCED GEO ATTRIBUTION</Text>
              <Text allowFontScaling={false} style={styles.lockedBody}>
                City-level attribution, regional performance and exportable reports.
              </Text>
              <GlowButton
                label="UNLOCK ANALYTICS"
                icon={AnalyticsIcon}
                tone="gold"
                onPress={() => {
                  hapticPress();
                  setPaywall(true);
                }}
              />
              <Chip label={SIMULATED_LABEL} tone="neutral" />
            </GlassCard>          )
        ) : null}
      </ScrollView>

      <AnalyticsPaywall
        visible={paywall}
        onClose={() => setPaywall(false)}
        onUnlock={() => {
          dispatch(setAnalytics(true));
          setPaywall(false);
        }}
      />
      <Notice offset={0} />
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  locked: { gap: space.md },
  lockedTitle: { ...typeScale.cardTitle, color: accent.gold, letterSpacing: 0.6 },
  lockedBody: { ...typeScale.body, color: ink.secondary },
});


