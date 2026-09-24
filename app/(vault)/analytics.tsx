import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnalyticsPaywall } from '../../components/vault/AnalyticsPaywall';
import { CreatorRow } from '../../components/vault/CreatorRow';
import { OverviewGrid } from '../../components/vault/OverviewGrid';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
import { Chip } from '../../components/shared/Chip';
import { Notice } from '../../components/shared/Notice';
import { AnalyticsIcon } from '../../components/shared/icons';
import { gmvLabel, SIMULATED_LABEL } from '../../data/mockCampaigns';
import { aggregateCities, sponsorOverview } from '../../services/vaultService';
import { selectCampaigns, selectCreators, setAnalytics, useClash } from '../../store';
import { accent, card, ink, layout, radius, space, typeScale } from '../../theme';
import { press as hapticPress, tap as hapticTap } from '../../utils/haptics';

/** Sponsor dashboard with executive dashboard feel - pure black, gold highlights, white typography. */
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
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
      >
        {/* Executive header */}
        <View style={styles.header}>
          <Text allowFontScaling={false} style={styles.title}>
            ANALYTICS
          </Text>
          <Text allowFontScaling={false} style={styles.subtitle}>
            Sponsor dashboard · {campaigns.length} campaigns
          </Text>
        </View>

        {/* Clean tabs */}
        <View style={styles.tabs}>
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
              style={styles.tab}
            >
              <Text
                allowFontScaling={false}
                style={[styles.tabText, tab === key && styles.tabTextActive]}
              >
                {key.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'overview' ? (
          <>
            <OverviewGrid overview={overview} creators={creators} />
            <Text allowFontScaling={false} style={styles.simLabel}>{SIMULATED_LABEL}</Text>
          </>
        ) : null}

        {tab === 'campaigns' ? (
          <>
            <Text allowFontScaling={false} style={styles.sectionTitle}>
              CAMPAIGNS
            </Text>
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
            <Text allowFontScaling={false} style={styles.sectionTitle}>
              CREATORS
            </Text>
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
              <Text allowFontScaling={false} style={styles.sectionTitle}>
                ADVANCED GEO ATTRIBUTION
              </Text>
              {/* Clean city distribution bars without visual noise */}
              <View style={styles.citySection}>
                {cities.slice(0, 5).map((city) => (
                  <View key={city.city} style={styles.cityRow}>
                    <Text allowFontScaling={false} style={styles.cityName}>
                      {city.city}
                    </Text>
                    <View style={styles.cityBarContainer}>
                      <View style={[styles.cityBar, { width: `${city.share}%` }]} />
                    </View>
                    <Text allowFontScaling={false} style={styles.cityPercentage}>
                      {city.share}%
                    </Text>
                  </View>
                ))}
              </View>
              <Text allowFontScaling={false} style={styles.simLabel}>
                {`${SIMULATED_LABEL} · TOP CITY ${overview.topCity.toUpperCase()}`}
              </Text>
            </>
          ) : (
            <View style={styles.locked}>
              <Text allowFontScaling={false} style={styles.lockedTitle}>ADVANCED GEO ATTRIBUTION</Text>
              <Text allowFontScaling={false} style={styles.lockedBody}>
                City-level attribution, regional performance and exportable reports.
              </Text>
              <Pressable
                onPress={() => {
                  hapticPress();
                  setPaywall(true);
                }}
                style={styles.unlockButton}
              >
                <Text allowFontScaling={false} style={styles.unlockText}>
                  UNLOCK ANALYTICS
                </Text>
              </Pressable>
              <Chip label={SIMULATED_LABEL} tone="neutral" />
            </View>
          )
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
  content: { paddingHorizontal: layout.screenX, gap: space.xl },
  header: {
    paddingBottom: space.lg,
  },
  title: {
    ...typeScale.title,
    color: ink.primary,
  },
  subtitle: {
    ...typeScale.body,
    color: ink.secondary,
    marginTop: space.xs,
  },
  tabs: {
    flexDirection: 'row',
    gap: space.md,
    paddingBottom: space.lg,
  },
  tab: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  tabText: {
    ...typeScale.data,
    color: ink.secondary,
  },
  tabTextActive: {
    color: accent.gold,
    fontWeight: '700',
  },
  sectionTitle: {
    ...typeScale.section,
    color: ink.primary,
    marginTop: space.md,
  },
  simLabel: {
    ...typeScale.caption,
    color: ink.tertiary,
    textAlign: 'center',
  },
  citySection: {
    gap: space.md,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  cityName: {
    ...typeScale.body,
    color: ink.primary,
    width: 80,
  },
  cityBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  cityBar: {
    height: '100%',
    backgroundColor: accent.gold,
  },
  cityPercentage: {
    ...typeScale.data,
    color: accent.gold,
    width: 40,
    textAlign: 'right',
  },
  locked: {
    padding: space.xl,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: accent.gold,
    backgroundColor: 'rgba(255,200,97,0.05)',
    gap: space.md,
    alignItems: 'center',
  },
  lockedTitle: {
    ...typeScale.cardTitle,
    color: accent.gold,
    letterSpacing: 0.6,
  },
  lockedBody: {
    ...typeScale.body,
    color: ink.secondary,
    textAlign: 'center',
  },
  unlockButton: {
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: accent.gold,
    marginTop: space.sm,
  },
  unlockText: {
    ...typeScale.button,
    color: ink.inverse,
  },
});


