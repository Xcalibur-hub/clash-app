/**
 * Creator campaign detail — own performance + shareable referral/coupon assets.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/shared/EmptyState';
import { GlowButton } from '../../components/shared/GlowButton';
import { BackIcon, RupeeIcon, ShareIcon } from '../../components/shared/icons';
import { StatusPill, StudioSection, statusTone } from '../../components/sponsor/StudioChrome';
import { analytics } from '../../services/analytics';
import { errorText } from '../../services/supabaseClient';
import {
  fetchCreatorCampaignEarnings,
  fetchMyCouponAssets,
  fetchMyReferralAssets,
  formatCampaignPeriod,
  formatCommissionLabel,
  formatMinorCurrency,
  type CreatorCampaignEarning,
  type CreatorCouponAsset,
  type CreatorReferralAsset,
} from '../../services/creatorEarningsService';
import { showNotice, useClash } from '../../store';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { copyTextToClipboard } from '../../utils/clipboard';
import { tap as hapticTap } from '../../utils/haptics';

export default function CreatorEarningsCampaignDetail(): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { dispatch } = useClash();
  const { campaignId: rawId } = useLocalSearchParams<{ campaignId?: string }>();
  const campaignId = String(rawId ?? '');

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [campaign, setCampaign] = React.useState<CreatorCampaignEarning | null>(null);
  const [links, setLinks] = React.useState<CreatorReferralAsset[]>([]);
  const [coupons, setCoupons] = React.useState<CreatorCouponAsset[]>([]);

  const load = React.useCallback(async () => {
    if (!campaignId) {
      setLoading(false);
      setError('Missing campaign.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [all, rl, cp] = await Promise.all([
        fetchCreatorCampaignEarnings(),
        fetchMyReferralAssets(campaignId),
        fetchMyCouponAssets(campaignId),
      ]);
      const match = all.find((c) => c.campaignId === campaignId) ?? null;
      setCampaign(match);
      setLinks(rl);
      setCoupons(cp);
      if (!match) setError('Campaign not found in your collaborations.');
    } catch (err) {
      setError(errorText(err));
      setCampaign(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const copyText = async (value: string, successMessage: string): Promise<void> => {
    const result = await copyTextToClipboard(value);
    hapticTap();
    if (result === 'copied') {
      dispatch(showNotice(successMessage));
      return;
    }
    if (result === 'shared') {
      dispatch(showNotice('Clipboard unavailable — use the share sheet to copy.'));
      return;
    }
    dispatch(showNotice('Couldn’t copy to clipboard.'));
  };

  const shareText = async (
    message: string,
    event: 'creator_referral_shared' | 'creator_coupon_shared',
  ): Promise<void> => {
    try {
      await Share.share({ message });
      analytics.track(event, { source: 'earnings' });
    } catch {
      dispatch(showNotice('Couldn’t open the share sheet.'));
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} style={{ marginTop: 80 }} />
      </View>
    );
  }

  if (!campaign) {
    return (
      <View style={[styles.root, { backgroundColor: t.background }]}>
        <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: layout.screenX }}>
          <BackBtn onPress={() => router.replace('/earnings')} />
        </View>
        <EmptyState
          icon={RupeeIcon}
          title="Campaign not found"
          body={error ?? 'This collaboration isn’t available on your account.'}
          actionLabel="Earnings"
          onAction={() => router.replace('/earnings')}
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
          <BackBtn onPress={() => router.replace('/earnings')} />
          <StatusPill label={campaign.campaignStatus} tone={statusTone(campaign.campaignStatus)} />
        </View>

        <Text allowFontScaling={false} style={[styles.brand, { color: t.textMuted }]}>
          {campaign.advertiserName}
        </Text>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]} numberOfLines={3}>
          {campaign.campaignTitle}
        </Text>
        <Text allowFontScaling={false} style={[styles.meta, { color: t.textSecondary }]}>
          {formatCampaignPeriod(campaign.startsAt, campaign.endsAt)} ·{' '}
          {formatCommissionLabel(
            campaign.commissionType,
            campaign.commissionValue,
            campaign.currency,
          )}
        </Text>

        {error ? (
          <Text allowFontScaling={false} style={[styles.error, { color: t.textSecondary }]}>
            {error}
          </Text>
        ) : null}

        <StudioSection title="Your performance">
          <View style={styles.metricGrid}>
            <Stat label="Clicks" value={campaign.clicks.toLocaleString('en-IN')} />
            <Stat
              label="Attributed"
              value={campaign.attributedConversions.toLocaleString('en-IN')}
            />
            <Stat
              label="Pending earnings"
              value={formatMinorCurrency(campaign.pendingCommissionMinor, campaign.currency)}
            />
            <Stat
              label="Approved earnings"
              value={formatMinorCurrency(campaign.approvedCommissionMinor, campaign.currency)}
            />
          </View>
          {(campaign.rejectedCommissionMinor > 0 || campaign.voidCommissionMinor > 0) ? (
            <Text allowFontScaling={false} style={[styles.note, { color: t.textMuted }]}>
              {campaign.rejectedCommissionMinor > 0
                ? `${formatMinorCurrency(campaign.rejectedCommissionMinor, campaign.currency)} rejected`
                : ''}
              {campaign.rejectedCommissionMinor > 0 && campaign.voidCommissionMinor > 0 ? ' · ' : ''}
              {campaign.voidCommissionMinor > 0
                ? `${formatMinorCurrency(campaign.voidCommissionMinor, campaign.currency)} void`
                : ''}
            </Text>
          ) : null}
          <Text allowFontScaling={false} style={[styles.note, { color: t.textMuted }]}>
            Payments are not enabled yet.
          </Text>
        </StudioSection>

        <StudioSection title="Referral links">
          {links.length === 0 ? (
            <Text allowFontScaling={false} style={[styles.note, { color: t.textMuted }]}>
              No referral links yet. Your brand partner can generate one for you.
            </Text>
          ) : (
            links.map((link) => (
              <View key={link.id} style={[styles.asset, { borderColor: t.border }]}>
                <Text
                  allowFontScaling={false}
                  style={[styles.assetTitle, { color: t.textPrimary }]}
                  numberOfLines={2}
                >
                  {link.shareUrl}
                </Text>
                <Text allowFontScaling={false} style={[styles.assetMeta, { color: t.textMuted }]}>
                  {link.status}
                </Text>
                <View style={styles.assetActions}>
                  <GlowButton
                    label="Copy"
                    compact
                    tone="glass"
                    onPress={() => void copyText(link.shareUrl, 'Link copied')}
                    accessibilityLabel="Copy referral link"
                  />
                  <Pressable
                    onPress={() => {
                      hapticTap();
                      void shareText(link.shareUrl, 'creator_referral_shared');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Share referral link"
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.iconAction,
                      { borderColor: t.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <ShareIcon size={16} color={t.textPrimary} strokeWidth={2.2} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </StudioSection>

        <StudioSection title="Coupon codes">
          {coupons.length === 0 ? (
            <Text allowFontScaling={false} style={[styles.note, { color: t.textMuted }]}>
              No coupon codes assigned to you for this campaign.
            </Text>
          ) : (
            coupons.map((c) => (
              <View key={c.id} style={[styles.asset, { borderColor: t.border }]}>
                <Text allowFontScaling={false} style={[styles.couponCode, { color: t.textPrimary }]}>
                  {c.code}
                </Text>
                <Text allowFontScaling={false} style={[styles.assetMeta, { color: t.textMuted }]}>
                  {c.status}
                  {c.maxRedemptions != null
                    ? ` · ${c.redemptionCount} / ${c.maxRedemptions} redemptions`
                    : ` · ${c.redemptionCount} redemptions`}
                </Text>
                <View style={styles.assetActions}>
                  <GlowButton
                    label="Copy code"
                    compact
                    tone="glass"
                    onPress={() => void copyText(c.code, 'Code copied')}
                    accessibilityLabel="Copy coupon code"
                  />
                  <Pressable
                    onPress={() => {
                      hapticTap();
                      void shareText(
                        `Use code ${c.code} on CLASH`,
                        'creator_coupon_shared',
                      );
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Share coupon code"
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.iconAction,
                      { borderColor: t.border, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <ShareIcon size={16} color={t.textPrimary} strokeWidth={2.2} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </StudioSection>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <View style={[styles.stat, { borderColor: t.border }]}>
      <Text allowFontScaling={false} style={[styles.statValue, { color: t.textPrimary }]}>
        {value}
      </Text>
      <Text allowFontScaling={false} style={[styles.statLabel, { color: t.textMuted }]}>
        {label}
      </Text>
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
      accessibilityLabel="Back to Earnings"
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
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    ...typeScale.caption,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  title: { ...typeScale.display, fontWeight: '700', marginTop: 4 },
  meta: { ...typeScale.body, marginTop: space.xs, marginBottom: space.sm },
  error: { ...typeScale.caption, marginBottom: space.sm },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stat: {
    flexGrow: 1,
    minWidth: '44%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.md,
    gap: 4,
  },
  statValue: { ...typeScale.title, fontWeight: '700' },
  statLabel: { ...typeScale.caption },
  note: { ...typeScale.caption, marginTop: space.sm },
  asset: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.md,
    gap: 6,
    marginBottom: space.sm,
  },
  assetTitle: { ...typeScale.body, fontWeight: '600' },
  couponCode: { ...typeScale.title, fontWeight: '700', letterSpacing: 1 },
  assetMeta: { ...typeScale.caption },
  assetActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 4 },
  iconAction: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
