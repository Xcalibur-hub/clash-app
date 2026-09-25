import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreatorRow } from '../../components/vault/CreatorRow';
import { OverviewGrid } from '../../components/vault/OverviewGrid';
import { sponsorScreen as sponsorStyles, vault as s } from '../../components/vault/vaultStyles';
import { Chip } from '../../components/shared/Chip';
import { EmptyState } from '../../components/shared/EmptyState';
import { GlassCard } from '../../components/shared/GlassCard';
import { Notice } from '../../components/shared/Notice';
import { StoreIcon } from '../../components/shared/icons';
import { conversionPct, gmvLakhs, SIMULATED_LABEL } from '../../data/mockCampaigns';
import { sponsorOverview } from '../../services/vaultService';
import { selectCampaigns, selectCreators, useClash } from '../../store';
import { ink, radius, space, typeScale } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

type SponsorTab = 'overview' | 'campaigns' | 'creators' | 'attribution';
const TABS: readonly SponsorTab[] = ['overview', 'campaigns', 'creators', 'attribution'];

/** SPONSOR DASHBOARD (spec Â§22): Overview Â· Campaigns Â· Creators Â· Attribution. */
export default function SponsorScreen(): React.JSX.Element {
  const { campaignId } = useLocalSearchParams<{ campaignId?: string }>();
  const { state } = useClash();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const campaigns = selectCampaigns(state);
  const creators = selectCreators(state);
  const anchor = campaigns.find((c) => c.id === campaignId);
  const [tab, setTab] = React.useState<SponsorTab>('overview');
  const scoped = React.useMemo(
    () => campaigns.filter((c) => !anchor || c.sponsor === anchor.sponsor),
    [anchor, campaigns],
  );
  const overview = React.useMemo(() => sponsorOverview(scoped), [scoped]);
  const ranked = React.useMemo(
    () =>
      [...creators]
        .map((creator) => ({
          creator,
          gmv: scoped.filter((c) => c.creatorId === creator.id).reduce((sum, c) => sum + c.gmv, 0),
        }))
        .filter((row) => row.gmv > 0)
        .sort((a, b) => b.gmv - a.gmv),
    [creators, scoped],
  );

  if (!anchor) {
    return (
      <View style={s.root}>
        <View style={[sponsorStyles.center, { paddingTop: insets.top }]}>
          <EmptyState
            icon={StoreIcon}
            title="Sponsor not found."
            body="This dashboard has no anchor campaign. Return to the Sponsor Radar."
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
        <View style={s.hero}>
          <View style={sponsorStyles.brandRow}>
            <StoreIcon size={20} color={anchor.sponsorTint} strokeWidth={2.4} />
            <Text allowFontScaling={false} style={sponsorStyles.brand}>{anchor.sponsor}</Text>
          </View>
          <Text allowFontScaling={false} style={s.sub}>Sponsor dashboard Â· {anchor.period}</Text>
          <View style={sponsorStyles.tabs}>
            {TABS.map((key) => (
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
                <Chip
                  label={key.charAt(0).toUpperCase() + key.slice(1)}
                  tone={tab === key ? 'mint' : 'neutral'}
                  data
                />
              </Pressable>
            ))}
          </View>
        </View>

        {tab === 'overview' ? (
          <>
            <OverviewGrid overview={overview} creators={creators} />
            <Text allowFontScaling={false} style={sponsorStyles.sim}>{SIMULATED_LABEL}</Text>
          </>
        ) : null}

        {tab === 'campaigns'
          ? scoped.map((campaign) => (
              <CreatorRow
                key={campaign.id}
                title={`${campaign.code} Â· ${campaign.status}`}
                sub={`${conversionPct(campaign)} conversion Â· ${campaign.period}`}
                value={gmvLakhs(campaign.gmv)}
                onPress={() => router.push(`/campaign/${campaign.id}`)}
              />
            ))
          : null}

        {tab === 'creators'
          ? ranked.map((row) => (
              <CreatorRow
                key={row.creator.id}
                title={`@${row.creator.handle}`}
                sub={row.creator.name}
                value={gmvLakhs(row.gmv)}
                onPress={() => router.push(`/creator/${row.creator.id}`)}
              />
            ))
          : null}

        {tab === 'attribution' ? (
          <GlassCard level="regular" corner={radius.xl} style={sponsorStyles.locked}>
            <Text allowFontScaling={false} style={sponsorStyles.lockedTitle}>Advanced geo attribution</Text>
            <Text allowFontScaling={false} style={sponsorStyles.lockedBody}>
              City-level attribution lives in Pro Analytics â€” â‚¹19,999/month, mock only.
            </Text>
            <Chip label={`Top city Â· ${overview.topCity}`} tone="neutral" data />
          </GlassCard>
        ) : null}
      </ScrollView>
      <Notice offset={0} />
    </View>
  );
}


