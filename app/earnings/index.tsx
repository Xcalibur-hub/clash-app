/**
 * Creator Earnings home — studio-style performance + campaign cards.
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
import { EmptyState } from '../../components/shared/EmptyState';
import { BackIcon, RupeeIcon } from '../../components/shared/icons';
import { GlowButton } from '../../components/shared/GlowButton';
import { StatusPill, statusTone } from '../../components/sponsor/StudioChrome';
import { useAuth } from '../../store/AuthProvider';
import { analytics } from '../../services/analytics';
import { errorText } from '../../services/supabaseClient';
import {
  fetchCreatorCampaignEarnings,
  fetchCreatorEarningsSummary,
  formatCampaignPeriod,
  formatCommissionLabel,
  formatMinorCurrency,
  type CreatorCampaignEarning,
  type CreatorEarningsSummary,
} from '../../services/creatorEarningsService';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

export default function CreatorEarningsHome(): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signedIn, loading: authLoading } = useAuth();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<CreatorEarningsSummary | null>(null);
  const [campaigns, setCampaigns] = React.useState<CreatorCampaignEarning[]>([]);

  const load = React.useCallback(async () => {
    if (!signedIn) {
      setLoading(false);
      setSummary(null);
      setCampaigns([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [sum, list] = await Promise.all([
        fetchCreatorEarningsSummary(),
        fetchCreatorCampaignEarnings(),
      ]);
      setSummary(sum);
      setCampaigns(list);
      analytics.track('creator_earnings_viewed', { source: 'sidebar' });
    } catch (err) {
      setError(errorText(err));
      setSummary(null);
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
          icon={RupeeIcon}
          title="Sign in for Earnings"
          body="Campaign collaborations and commission appear after you sign in."
          actionLabel="Sign in"
          onAction={() => router.push('/auth')}
        />
      </View>
    );
  }

  if (error && !summary) {
    return (
      <View style={[styles.root, { backgroundColor: t.background }]}>
        <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: layout.screenX }}>
          <BackBtn onPress={() => router.back()} />
        </View>
        <EmptyState
          icon={RupeeIcon}
          title="Couldn’t load earnings"
          body={error}
          actionLabel="Retry"
          onAction={() => void load()}
        />
      </View>
    );
  }

  const empty = !summary || summary.campaignCount === 0;

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
        <BackBtn onPress={() => router.back()} />

        <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
          Earnings
        </Text>

        {empty ? (
          <View style={[styles.emptyBlock, { borderColor: t.border }]}>
            <Text allowFontScaling={false} style={[styles.emptyTitle, { color: t.textPrimary }]}>
              No campaigns yet.
            </Text>
            <Text allowFontScaling={false} style={[styles.emptyBody, { color: t.textMuted }]}>
              Brand collaborations assigned to you will appear here.
            </Text>
          </View>
        ) : summary ? (
          <>
            <Text
              allowFontScaling={false}
              style={[styles.heroAmount, { color: t.textPrimary }]}
              accessibilityRole="header"
            >
              {formatMinorCurrency(summary.totalEarnedMinor, summary.currency)}
            </Text>
            <Text allowFontScaling={false} style={[styles.heroSub, { color: t.textSecondary }]}>
              earned through CLASH
            </Text>
            <View style={styles.heroSplit}>
              <Text allowFontScaling={false} style={[styles.splitLine, { color: t.textSecondary }]}>
                {formatMinorCurrency(summary.approvedCommissionMinor, summary.currency)} approved
              </Text>
              <Text allowFontScaling={false} style={[styles.splitDot, { color: t.textMuted }]}>
                ·
              </Text>
              <Text allowFontScaling={false} style={[styles.splitLine, { color: t.textSecondary }]}>
                {formatMinorCurrency(summary.pendingCommissionMinor, summary.currency)} pending
              </Text>
            </View>
            <Text allowFontScaling={false} style={[styles.payoutNote, { color: t.textMuted }]}>
              Payments are not enabled yet.
            </Text>

            <View style={styles.metricRow}>
              <Metric
                label="Clicks"
                value={summary.clicks.toLocaleString('en-IN')}
              />
              <Metric
                label="Attributed"
                value={summary.attributedConversions.toLocaleString('en-IN')}
              />
              <Metric label="Campaigns" value={String(summary.campaignCount)} />
            </View>

            {(summary.rejectedCommissionMinor > 0 || summary.voidCommissionMinor > 0) ? (
              <Text allowFontScaling={false} style={[styles.ledgerNote, { color: t.textMuted }]}>
                {summary.rejectedCommissionMinor > 0
                  ? `${formatMinorCurrency(summary.rejectedCommissionMinor, summary.currency)} rejected`
                  : null}
                {summary.rejectedCommissionMinor > 0 && summary.voidCommissionMinor > 0 ? ' · ' : null}
                {summary.voidCommissionMinor > 0
                  ? `${formatMinorCurrency(summary.voidCommissionMinor, summary.currency)} void`
                  : null}
              </Text>
            ) : null}
          </>
        ) : null}

        {!empty ? (
          <View style={styles.listHead}>
            <Text allowFontScaling={false} style={[styles.sectionTitle, { color: t.textPrimary }]}>
              Campaigns
            </Text>
          </View>
        ) : null}

        {campaigns.map((c) => (
          <CampaignCard
            key={c.campaignId}
            item={c}
            onPress={() => {
              hapticTap();
              analytics.track('creator_campaign_opened', { source: 'earnings' });
              router.push(`/earnings/${c.campaignId}`);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={[styles.metric, { borderColor: t.border }]}>
      <Text allowFontScaling={false} style={[styles.metricValue, { color: t.textPrimary }]}>
        {value}
      </Text>
      <Text allowFontScaling={false} style={[styles.metricLabel, { color: t.textMuted }]}>
        {label}
      </Text>
    </View>
  );
}

function CampaignCard({
  item,
  onPress,
}: {
  item: CreatorCampaignEarning;
  onPress: () => void;
}): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View campaign ${item.campaignTitle}`}
      style={({ pressed }) => [
        styles.card,
        { borderColor: t.border, backgroundColor: t.surface, opacity: pressed ? 0.88 : 1 },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text allowFontScaling={false} style={[styles.cardBrand, { color: t.textMuted }]} numberOfLines={1}>
            {item.advertiserName}
          </Text>
          <Text allowFontScaling={false} style={[styles.cardTitle, { color: t.textPrimary }]} numberOfLines={2}>
            {item.campaignTitle}
          </Text>
        </View>
        <StatusPill label={item.campaignStatus} tone={statusTone(item.campaignStatus)} />
      </View>
      <Text allowFontScaling={false} style={[styles.cardMeta, { color: t.textMuted }]}>
        {formatCampaignPeriod(item.startsAt, item.endsAt)}
      </Text>
      <Text allowFontScaling={false} style={[styles.cardStats, { color: t.textSecondary }]}>
        {item.clicks.toLocaleString('en-IN')} clicks ·{' '}
        {item.attributedConversions.toLocaleString('en-IN')} conversions
      </Text>
      <View style={styles.cardFooter}>
        <Text allowFontScaling={false} style={[styles.cardEarn, { color: t.textPrimary }]}>
          {formatMinorCurrency(item.pendingCommissionMinor, item.currency)} pending
        </Text>
        <Text allowFontScaling={false} style={[styles.cardComm, { color: t.textMuted }]}>
          {formatCommissionLabel(item.commissionType, item.commissionValue, item.currency)}
        </Text>
      </View>
      <GlowButton label="View campaign" onPress={onPress} compact tone="glass" />
    </Pressable>
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
      style={({ pressed }) => [
        styles.iconBtn,
        { borderColor: t.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <BackIcon size={18} color={t.textPrimary} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: layout.screenX, gap: space.xs },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  eyebrow: {
    ...typeScale.caption,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  heroAmount: { ...typeScale.display, fontWeight: '700', marginTop: space.sm },
  heroSub: { ...typeScale.body, marginTop: 4 },
  heroSplit: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: space.sm,
  },
  splitLine: { ...typeScale.label },
  splitDot: { ...typeScale.label },
  payoutNote: { ...typeScale.caption, marginTop: space.sm },
  ledgerNote: { ...typeScale.caption, marginTop: space.xs },
  metricRow: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  metric: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    gap: 4,
  },
  metricValue: { ...typeScale.title, fontWeight: '700' },
  metricLabel: { ...typeScale.caption },
  listHead: { marginTop: space.xl, marginBottom: space.sm },
  sectionTitle: { ...typeScale.label, fontWeight: '700' },
  emptyBlock: {
    marginTop: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  emptyTitle: { ...typeScale.title, fontWeight: '700' },
  emptyBody: { ...typeScale.body },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.md,
    gap: 8,
    marginBottom: space.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  cardBrand: { ...typeScale.caption, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  cardTitle: { ...typeScale.title, fontWeight: '700' },
  cardMeta: { ...typeScale.caption },
  cardStats: { ...typeScale.body },
  cardFooter: { gap: 2, marginBottom: space.xs },
  cardEarn: { ...typeScale.label, fontWeight: '700' },
  cardComm: { ...typeScale.caption },
});
