import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnalyticsPaywall } from '../../components/vault/AnalyticsPaywall';
import { AttributionPanel } from '../../components/vault/AttributionPanel';
import { CreatorRow } from '../../components/vault/CreatorRow';
import { OverviewGrid } from '../../components/vault/OverviewGrid';
import { analytics as s } from '../../components/vault/analyticsStyles';
import { Notice } from '../../components/shared/Notice';
import { gmvLabel, SIMULATED_LABEL } from '../../data/mockCampaigns';
import { aggregateCities, sponsorOverview } from '../../services/vaultService';
import { selectCampaigns, selectCreators, setAnalytics, useClash } from '../../store';
import { space } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

type AnalyticsTab = 'overview' | 'campaigns' | 'creators' | 'attribution';

const TABS: readonly { key: AnalyticsTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'creators', label: 'Creators' },
  { key: 'attribution', label: 'Attribution' },
];

/** Sponsor dashboard (§22): KPI grid + ranked rows + geo attribution, Apple/Linear calm. */
export default function AnalyticsScreen(): React.JSX.Element {
  const { state, dispatch } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = React.useState<AnalyticsTab>('overview');
  const [paywall, setPaywall] = React.useState(false);
  const campaigns = selectCampaigns(state);
  const creators = selectCreators(state);
  const overview = React.useMemo(() => sponsorOverview(campaigns), [campaigns]);
  const cities = React.useMemo(() => aggregateCities(campaigns), [campaigns]);
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
    <View style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingTop: insets.top + space.md }]}
      >
        <View style={s.header}>
          <Text allowFontScaling={false} style={s.title}>Analytics</Text>
          <Text allowFontScaling={false} style={s.subtitle}>
            Sponsor dashboard · {campaigns.length} campaigns
          </Text>
        </View>

        <View style={s.tabs}>
          {TABS.map((entry) => (
            <Pressable
              key={entry.key}
              onPress={() => {
                hapticTap();
                setTab(entry.key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === entry.key }}
              accessibilityLabel={`${entry.label} tab`}
              style={s.tab}
            >
              <Text
                allowFontScaling={false}
                style={[s.tabText, tab === entry.key && s.tabTextActive]}
              >
                {entry.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'overview' ? (
          <>
            <OverviewGrid overview={overview} creators={creators} />
            <Text allowFontScaling={false} style={s.simLabel}>{SIMULATED_LABEL}</Text>
          </>
        ) : null}

        {tab === 'campaigns' ? (
          <>
            <Text allowFontScaling={false} style={s.sectionTitle}>Campaigns</Text>
            {campaigns.map((campaign) => (
              <CreatorRow
                key={campaign.id}
                title={`${campaign.code} · ${campaign.sponsor}`}
                sub={`${campaign.status.toLowerCase()} · ${campaign.period}`}
                value={gmvLabel(campaign.gmv)}
                onPress={() => router.push(`/campaign/${campaign.id}`)}
              />
            ))}
          </>
        ) : null}

        {tab === 'creators' ? (
          <>
            <Text allowFontScaling={false} style={s.sectionTitle}>Creators</Text>
            {ranked.map((creator) => {
              const gmv = campaigns
                .filter((c) => c.creatorId === creator.id)
                .reduce((sum, c) => sum + c.gmv, 0);
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
          <AttributionPanel
            unlocked={state.analyticsUnlocked}
            cities={cities}
            topCity={overview.topCity}
            onUnlock={() => setPaywall(true)}
          />
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
    </View>
  );
}