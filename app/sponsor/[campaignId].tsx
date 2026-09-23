import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreatorRow } from '../../components/vault/CreatorRow';
import { OverviewGrid } from '../../components/vault/OverviewGrid';
import { vault as s } from '../../components/vault/vaultStyles';
import { AuroraBackground } from '../../components/shared/AuroraBackground';
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

/** SPONSOR DASHBOARD (spec §22): Overview · Campaigns · Creators · Attribution. */
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
      <AuroraBackground tone="calm" doodles={false}>
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <EmptyState
            icon={StoreIcon}
            title="Sponsor not found."
            body="This dashboard has no anchor campaign. Return to the Sponsor Radar."
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
        <View style={s.hero}>
          <View style={styles.brandRow}>
            <StoreIcon size={20} color="#A580FF" strokeWidth={2.4} />
            <Text allowFontScaling={false} style={styles.brand}>{anchor.sponsor.toUpperCase()}</Text>
          </View>
          <Text allowFontScaling={false} style={s.sub}>Sponsor dashboard · {anchor.period}</Text>
          <View style={styles.tabs}>
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
                <Chip label={key.toUpperCase()} tone={tab === key ? 'gold' : 'neutral'} data />
              </Pressable>
            ))}
          </View>
        </View>

        {tab === 'overview' ? (
          <>
            <OverviewGrid overview={overview} creators={creators} />
            <Text allowFontScaling={false} style={styles.sim}>{SIMULATED_LABEL}</Text>
          </>
        ) : null}

        {tab === 'campaigns'
          ? scoped.map((campaign) => (
              <CreatorRow
                key={campaign.id}
                title={`${campaign.code} · ${campaign.status}`}
                sub={`${conversionPct(campaign)} conversion · ${campaign.period}`}
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
          <GlassCard level="regular" corner={radius.xl} style={styles.locked}>
            <Text allowFontScaling={false} style={styles.lockedTitle}>ADVANCED GEO ATTRIBUTION</Text>
            <Text allowFontScaling={false} style={styles.lockedBody}>
              City-level attribution lives in PRO ANALYTICS — ₹19,999/month, mock only.
            </Text>
            <Chip label={`TOP CITY · ${overview.topCity.toUpperCase()}`} tone="violet" data />
          </GlassCard>
        ) : null}
      </ScrollView>
      <Notice offset={0} />
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, paddingHorizontal: space.lg, justifyContent: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  brand: { ...typeScale.title, fontSize: 22, letterSpacing: 2.6, color: ink.primary },
  tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sim: { ...typeScale.meta, color: ink.tertiary },
  locked: { gap: space.sm },
  lockedTitle: { ...typeScale.cardTitle, color: ink.primary },
  lockedBody: { ...typeScale.body, color: ink.secondary },
});

