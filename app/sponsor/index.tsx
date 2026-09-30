/**
 * Sponsor Studio home — advertiser performance overview + campaign list.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MetricCell, StatusPill, StudioSection, statusTone } from '../../components/sponsor/StudioChrome';
import { EmptyState } from '../../components/shared/EmptyState';
import { BackIcon, PlusIcon, StoreIcon } from '../../components/shared/icons';
import { GlowButton } from '../../components/shared/GlowButton';
import { useAuth } from '../../store/AuthProvider';
import { analytics } from '../../services/analytics';
import { errorText } from '../../services/supabaseClient';
import {
  activateAdvertiser,
  fetchMyAdvertisers,
  fetchMyCampaigns,
  fetchStudioOverview,
  formatMinorCurrency,
  type Advertiser,
  type CampaignListItem,
  type StudioOverview,
} from '../../services/sponsorService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

function formatRange(startsAt: string | null, endsAt: string | null): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  if (startsAt && endsAt) return `${fmt(startsAt)} – ${fmt(endsAt)}`;
  if (startsAt) return `From ${fmt(startsAt)}`;
  if (endsAt) return `Until ${fmt(endsAt)}`;
  return 'Open dates';
}

export default function SponsorStudioHome(): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signedIn, loading: authLoading } = useAuth();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [advertisers, setAdvertisers] = React.useState<readonly Advertiser[]>([]);
  const [advertiser, setAdvertiser] = React.useState<Advertiser | null>(null);
  const [overview, setOverview] = React.useState<StudioOverview | null>(null);
  const [campaigns, setCampaigns] = React.useState<CampaignListItem[]>([]);
  const [activating, setActivating] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!signedIn) {
      setLoading(false);
      setAdvertisers([]);
      setAdvertiser(null);
      setOverview(null);
      setCampaigns([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await fetchMyAdvertisers();
      setAdvertisers(list);
      const primary = list[0] ?? null;
      setAdvertiser(primary);
      if (!primary) {
        setOverview(null);
        setCampaigns([]);
        return;
      }
      const [ov, camps] = await Promise.all([
        fetchStudioOverview(primary.id),
        fetchMyCampaigns(primary.id),
      ]);
      setOverview(ov);
      setCampaigns(camps);
      analytics.track('sponsor_dashboard_viewed', { source: 'sidebar' });
    } catch (err) {
      setError(errorText(err));
      setOverview(null);
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  const onActivate = async (): Promise<void> => {
    if (!advertiser) return;
    setActivating(true);
    try {
      const next = await activateAdvertiser(advertiser.id);
      setAdvertiser(next);
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setActivating(false);
    }
  };

  if (authLoading || loading) {
    return (
      <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} style={{ marginTop: 80 }} />
      </View>
    );
  }

  if (!signedIn) {
    return (
      <View style={[styles.root, { backgroundColor: t.background }]}>
        <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: layout.screenX }}>
          <BackBtn onPress={() => router.back()} />
        </View>
        <EmptyState
          icon={StoreIcon}
          title="Sign in for Sponsor Studio"
          body="Advertiser tools are available after you sign in."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </View>
    );
  }

  if (error && !advertiser) {
    return (
      <View style={[styles.root, { backgroundColor: t.background }]}>
        <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: layout.screenX }}>
          <BackBtn onPress={() => router.back()} />
        </View>
        <EmptyState
          icon={StoreIcon}
          title="Couldn’t load Sponsor Studio"
          body={error}
          actionLabel="Retry"
          onAction={() => void load()}
        />
      </View>
    );
  }

  if (!advertiser) {
    return (
      <View style={[styles.root, { backgroundColor: t.background }]}>
        <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: layout.screenX }}>
          <BackBtn onPress={() => router.back()} />
        </View>
        <EmptyState
          icon={StoreIcon}
          title="Create your sponsor workspace"
          body="Set up an advertiser profile to launch campaigns and track referrals."
          actionLabel="Create workspace"
          onAction={() => router.push('/sponsor/new?mode=advertiser')}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + space.md,
            paddingBottom: insets.bottom + space.xxl,
          },
        ]}
      >
        <View style={styles.topRow}>
          <BackBtn onPress={() => router.back()} />
          <Pressable
            onPress={() => {
              hapticTap();
              router.push('/sponsor/new');
            }}
            accessibilityRole="button"
            accessibilityLabel="New campaign"
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, { borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <PlusIcon size={18} color={t.textPrimary} strokeWidth={2.2} />
          </Pressable>
        </View>

        <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
          Sponsor Studio
        </Text>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]} numberOfLines={2}>
          {advertiser.name}
        </Text>
        <View style={styles.metaRow}>
          <StatusPill label={advertiser.status} tone={statusTone(advertiser.status)} />
          {advertisers.length > 1 ? (
            <Text allowFontScaling={false} style={[styles.metaHint, { color: t.textMuted }]}>
              {advertisers.length} workspaces
            </Text>
          ) : null}
        </View>

        {advertiser.status === 'DRAFT' ? (
          <View style={[styles.banner, { borderColor: t.border, backgroundColor: t.surfaceMuted }]}>
            <Text allowFontScaling={false} style={[styles.bannerText, { color: t.textSecondary }]}>
              Activate your workspace before going live with campaigns.
            </Text>
            <GlowButton
              label={activating ? 'Activating…' : 'Activate workspace'}
              onPress={() => void onActivate()}
              disabled={activating}
              compact
              tone="glass"
            />
          </View>
        ) : null}

        {error ? (
          <Text allowFontScaling={false} style={[styles.errorLine, { color: t.textSecondary }]}>
            {error}
          </Text>
        ) : null}

        {overview ? (
          <StudioSection title="Performance">
            <View style={styles.metricGrid}>
              <MetricCell label="Active campaigns" value={String(overview.activeCampaigns)} />
              <MetricCell label="Clicks" value={overview.clicks.toLocaleString('en-IN')} />
              <MetricCell label="Conversions" value={overview.conversions.toLocaleString('en-IN')} />
              <MetricCell
                label="Attributed"
                value={overview.attributedConversions.toLocaleString('en-IN')}
              />
              <MetricCell
                label="Revenue"
                value={formatMinorCurrency(overview.grossRevenueMinor, 'INR')}
              />
              <MetricCell
                label="Creator cost"
                value={formatMinorCurrency(overview.creatorCommissionMinor, 'INR')}
              />
            </View>
          </StudioSection>
        ) : null}

        <StudioSection title="Campaigns">
          {campaigns.length === 0 ? (
            <View style={[styles.emptyCard, { borderColor: t.border }]}>
              <Text allowFontScaling={false} style={[styles.emptyTitle, { color: t.textPrimary }]}>
                Launch your first campaign
              </Text>
              <Text allowFontScaling={false} style={[styles.emptyBody, { color: t.textMuted }]}>
                Draft a referral campaign, assign creators, then go live.
              </Text>
              <GlowButton
                label="Create campaign"
                onPress={() => router.push('/sponsor/new')}
                compact
                tone="glass"
              />
            </View>
          ) : (
            campaigns.map((c) => (
              <CampaignCard
                key={c.campaignId}
                item={c}
                onPress={() => {
                  hapticTap();
                  router.push(`/sponsor/${c.campaignId}`);
                }}
              />
            ))
          )}
        </StudioSection>
      </ScrollView>
    </View>
  );
}

function BackBtn({ onPress }: { onPress: () => void }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={10}
      style={({ pressed }) => [styles.iconBtn, { borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}
    >
      <BackIcon size={18} color={t.textPrimary} strokeWidth={2.2} />
    </Pressable>
  );
}

function CampaignCard({
  item,
  onPress,
}: {
  item: CampaignListItem;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open campaign ${item.title}`}
      style={({ pressed }) => [
        styles.card,
        { borderColor: t.border, backgroundColor: t.surface, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.cardTop}>
        <Text allowFontScaling={false} style={[styles.cardTitle, { color: t.textPrimary }]} numberOfLines={2}>
          {item.title}
        </Text>
        <StatusPill label={item.status} tone={statusTone(item.status)} />
      </View>
      <Text allowFontScaling={false} style={[styles.cardMeta, { color: t.textMuted }]}>
        {item.campaignType.replace(/_/g, ' ')} · {item.currency} · {formatRange(item.startsAt, item.endsAt)}
      </Text>
      <View style={styles.cardStats}>
        <Text allowFontScaling={false} style={[styles.cardStat, { color: t.textSecondary }]}>
          {item.clicks.toLocaleString('en-IN')} clicks
        </Text>
        <Text allowFontScaling={false} style={[styles.cardStat, { color: t.textSecondary }]}>
          {item.conversions.toLocaleString('en-IN')} conv
        </Text>
        <Text allowFontScaling={false} style={[styles.cardStat, { color: t.textSecondary }]}>
          {formatMinorCurrency(item.grossRevenueMinor, item.currency)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenX,
    gap: space.xs,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    ...typeScale.caption,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  title: {
    ...typeScale.display,
    fontWeight: '700',
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  metaHint: { ...typeScale.caption },
  banner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
    marginBottom: space.sm,
  },
  bannerText: { ...typeScale.body },
  errorLine: { ...typeScale.caption, marginBottom: space.sm },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  emptyCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  emptyTitle: { ...typeScale.title, fontWeight: '700' },
  emptyBody: { ...typeScale.body, marginBottom: space.xs },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.md,
    gap: 6,
    marginBottom: space.sm,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  cardTitle: { ...typeScale.title, fontWeight: '700', flex: 1 },
  cardMeta: { ...typeScale.caption },
  cardStats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: 4 },
  cardStat: { ...typeScale.caption, fontWeight: '600' },
});
