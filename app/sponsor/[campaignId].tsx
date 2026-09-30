/**
 * Sponsor campaign detail — overview, creators, links/coupons, privacy-safe geo.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MetricCell,
  StatusPill,
  StudioSection,
  statusTone,
} from '../../components/sponsor/StudioChrome';
import { EmptyState } from '../../components/shared/EmptyState';
import { GlowButton } from '../../components/shared/GlowButton';
import { BackIcon, ShareIcon, StoreIcon } from '../../components/shared/icons';
import { analytics } from '../../services/analytics';
import { searchPeople } from '../../services/searchService';
import { errorText } from '../../services/supabaseClient';
import {
  assignCreator,
  createCoupon,
  createReferralLink,
  fetchAdvertiserCampaignSummary,
  fetchCampaignCreatorStats,
  fetchCampaignGeoSummary,
  fetchCampaignMeta,
  formatMinorCurrency,
  listCoupons,
  listReferralLinks,
  pauseCampaign,
  percentToBasisPoints,
  previewCouponCode,
  resumeCampaign,
  setCampaignStatus,
  type AdvertiserCampaignSummary,
  type AdvertiserGeoBucket,
  type CouponRow,
  type CreatorCampaignStatRow,
  type ReferralLinkRow,
} from '../../services/sponsorService';
import type { CommissionType, SponsorCampaignStatus } from '../../supabase/types';
import type { User } from '../../store/types';
import { layout, radius, space, typeScale, useThemeColors } from '../../theme';
import { tap as hapticTap } from '../../utils/haptics';

type DetailTab = 'overview' | 'creators' | 'links' | 'geography';

const TABS: readonly { key: DetailTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'creators', label: 'Creators' },
  { key: 'links', label: 'Links & Coupons' },
  { key: 'geography', label: 'Geography' },
];

export default function SponsorCampaignDetail(): React.JSX.Element {
  const t = useThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { campaignId: rawId } = useLocalSearchParams<{ campaignId?: string }>();
  const campaignId = String(rawId ?? '');

  const [tab, setTab] = React.useState<DetailTab>('overview');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [meta, setMeta] = React.useState<Awaited<ReturnType<typeof fetchCampaignMeta>>>(null);
  const [summary, setSummary] = React.useState<AdvertiserCampaignSummary | null>(null);
  const [creators, setCreators] = React.useState<CreatorCampaignStatRow[]>([]);
  const [geo, setGeo] = React.useState<AdvertiserGeoBucket[]>([]);
  const [links, setLinks] = React.useState<ReferralLinkRow[]>([]);
  const [coupons, setCoupons] = React.useState<CouponRow[]>([]);

  // Assign form
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<User[]>([]);
  const [picked, setPicked] = React.useState<User | null>(null);
  const [commissionType, setCommissionType] = React.useState<CommissionType>('PERCENTAGE');
  const [commissionInput, setCommissionInput] = React.useState('10');

  // Coupon form
  const [couponCode, setCouponCode] = React.useState('');
  const [couponCreatorId, setCouponCreatorId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!campaignId) {
      setLoading(false);
      setError('Missing campaign.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [m, s, c, g, rl, cp] = await Promise.all([
        fetchCampaignMeta(campaignId),
        fetchAdvertiserCampaignSummary(campaignId),
        fetchCampaignCreatorStats(campaignId),
        fetchCampaignGeoSummary(campaignId),
        listReferralLinks(campaignId),
        listCoupons(campaignId),
      ]);
      if (!m) {
        setMeta(null);
        setError('Campaign not found.');
        return;
      }
      setMeta(m);
      setSummary(s);
      setCreators(c);
      setGeo(g);
      setLinks(rl);
      setCoupons(cp);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!couponCreatorId && creators[0]) {
      setCouponCreatorId(creators[0].creatorProfileId);
    }
  }, [creators, couponCreatorId]);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void searchPeople(q, 8)
        .then((rows) => {
          if (!cancelled) setHits(rows);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const runStatus = async (next: SponsorCampaignStatus | 'pause' | 'resume'): Promise<void> => {
    if (!meta) return;
    setBusy(true);
    setError(null);
    try {
      if (next === 'pause') await pauseCampaign(meta.id);
      else if (next === 'resume') await resumeCampaign(meta.id);
      else await setCampaignStatus(meta.id, next);
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const onAssign = async (): Promise<void> => {
    if (!meta || !picked) {
      setError('Pick a creator to assign.');
      return;
    }
    const raw = Number(commissionInput);
    if (!Number.isFinite(raw) || raw < 0) {
      setError('Commission must be non-negative.');
      return;
    }
    let value = 0;
    let type = commissionType;
    if (type === 'PERCENTAGE') {
      if (raw > 100) {
        setError('Percentage cannot exceed 100%.');
        return;
      }
      value = percentToBasisPoints(raw);
    } else if (type === 'FIXED_PER_CONVERSION') {
      value = Math.round(raw * 100); // major → minor
    } else {
      type = 'NONE';
      value = 0;
    }
    setBusy(true);
    setError(null);
    try {
      await assignCreator({
        campaignId: meta.id,
        creatorProfileId: picked.id,
        commissionType: type,
        commissionValue: value,
      });
      analytics.track('sponsor_creator_assigned', { source: 'sponsor_studio' });
      setPicked(null);
      setQuery('');
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const onReferral = async (creatorProfileId: string): Promise<void> => {
    if (!meta) return;
    setBusy(true);
    setError(null);
    try {
      const link = await createReferralLink(meta.id, creatorProfileId);
      analytics.track('sponsor_referral_created', { source: 'sponsor_studio' });
      await load();
      await Share.share({ message: link.shareUrl });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const onCoupon = async (): Promise<void> => {
    if (!meta || !couponCreatorId) {
      setError('Assign a creator before creating a coupon.');
      return;
    }
    const code = previewCouponCode(couponCode);
    if (!code) {
      setError('Enter a coupon code.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createCoupon({
        campaignId: meta.id,
        creatorProfileId: couponCreatorId,
        code,
      });
      analytics.track('sponsor_coupon_created', { source: 'sponsor_studio' });
      setCouponCode('');
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={t.textPrimary} style={{ marginTop: 80 }} />
      </View>
    );
  }

  if (!meta) {
    return (
      <View style={[styles.root, { backgroundColor: t.background }]}>
        <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: layout.screenX }}>
          <BackChip onPress={() => router.replace('/sponsor')} />
        </View>
        <EmptyState
          icon={StoreIcon}
          title="Campaign not found"
          body={error ?? 'This campaign is unavailable in your workspace.'}
          actionLabel="Sponsor Studio"
          onAction={() => router.replace('/sponsor')}
        />
      </View>
    );
  }

  const convRate =
    summary && summary.clicks > 0
      ? `${((summary.conversions / summary.clicks) * 100).toFixed(1)}%`
      : '—';

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
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
          <BackChip onPress={() => router.replace('/sponsor')} />
          <StatusPill label={meta.status} tone={statusTone(meta.status)} />
        </View>

        <Text allowFontScaling={false} style={[styles.eyebrow, { color: t.textMuted }]}>
          {meta.campaignType.replace(/_/g, ' ')} · {meta.currency}
        </Text>
        <Text allowFontScaling={false} style={[styles.title, { color: t.textPrimary }]} numberOfLines={3}>
          {meta.title}
        </Text>
        {meta.description ? (
          <Text allowFontScaling={false} style={[styles.sub, { color: t.textSecondary }]}>
            {meta.description}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {meta.status === 'DRAFT' ? (
            <GlowButton
              label={busy ? '…' : 'Activate'}
              onPress={() => void runStatus('ACTIVE')}
              disabled={busy}
              compact
              tone="glass"
            />
          ) : null}
          {meta.status === 'ACTIVE' ? (
            <GlowButton
              label={busy ? '…' : 'Pause'}
              onPress={() => void runStatus('pause')}
              disabled={busy}
              compact
              tone="glass"
            />
          ) : null}
          {meta.status === 'PAUSED' ? (
            <GlowButton
              label={busy ? '…' : 'Resume'}
              onPress={() => void runStatus('resume')}
              disabled={busy}
              compact
              tone="glass"
            />
          ) : null}
          {meta.status === 'ACTIVE' || meta.status === 'PAUSED' ? (
            <GlowButton
              label={busy ? '…' : 'End'}
              onPress={() => void runStatus('ENDED')}
              disabled={busy}
              compact
              tone="glass"
            />
          ) : null}
        </View>

        {error ? (
          <Text allowFontScaling={false} style={[styles.error, { color: t.textSecondary }]}>
            {error}
          </Text>
        ) : null}

        <View style={styles.tabs}>
          {TABS.map((item) => {
            const active = tab === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  hapticTap();
                  setTab(item.key);
                }}
                style={[
                  styles.tab,
                  {
                    borderColor: active ? t.textPrimary : t.border,
                    backgroundColor: active ? t.surfaceMuted : 'transparent',
                  },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.tabLabel, { color: active ? t.textPrimary : t.textMuted }]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'overview' && summary ? (
          <StudioSection title="Results">
            <View style={styles.metricGrid}>
              <MetricCell label="Clicks" value={summary.clicks.toLocaleString('en-IN')} />
              <MetricCell label="Conversions" value={summary.conversions.toLocaleString('en-IN')} />
              <MetricCell
                label="Attributed"
                value={summary.attributedConversions.toLocaleString('en-IN')}
              />
              <MetricCell label="Conv. rate" value={convRate} />
              <MetricCell
                label="Gross revenue"
                value={formatMinorCurrency(summary.grossRevenueMinor, meta.currency)}
              />
              <MetricCell
                label="Creator commission"
                value={formatMinorCurrency(summary.creatorCommissionMinor, meta.currency)}
              />
            </View>
            {summary.attributedConversions === 0 ? (
              <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
                No attributed conversions yet
              </Text>
            ) : null}
          </StudioSection>
        ) : null}

        {tab === 'creators' ? (
          <StudioSection title="Assigned creators">
            {creators.length === 0 ? (
              <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
                Assign a creator to start generating referral traffic
              </Text>
            ) : (
              creators.map((row) => (
                <View
                  key={row.creatorProfileId}
                  style={[styles.rowCard, { borderColor: t.border }]}
                >
                  <Text allowFontScaling={false} style={[styles.rowTitle, { color: t.textPrimary }]}>
                    {row.creatorName || row.creatorHandle}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.rowMeta, { color: t.textMuted }]}>
                    @{row.creatorHandle} · {commissionLabel(row)} · {row.assignmentStatus}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.rowMeta, { color: t.textSecondary }]}>
                    {row.clicks.toLocaleString('en-IN')} clicks ·{' '}
                    {row.attributedConversions.toLocaleString('en-IN')} attributed ·{' '}
                    {formatMinorCurrency(row.commissionAccruedMinor, meta.currency)} accrued
                  </Text>
                  <Pressable
                    onPress={() => void onReferral(row.creatorProfileId)}
                    style={styles.inlineAction}
                  >
                    <ShareIcon size={14} color={t.accent} strokeWidth={2.2} />
                    <Text allowFontScaling={false} style={[styles.inlineActionText, { color: t.accent }]}>
                      Generate referral link
                    </Text>
                  </Pressable>
                </View>
              ))
            )}

            <Text allowFontScaling={false} style={[styles.formHeading, { color: t.textPrimary }]}>
              Assign creator
            </Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by handle or name"
              placeholderTextColor={t.textMuted}
              style={inputStyle(t)}
              autoCapitalize="none"
              accessibilityLabel="Search creators"
            />
            {hits.map((u) => (
              <Pressable
                key={u.id}
                onPress={() => {
                  hapticTap();
                  setPicked(u);
                  setQuery(u.handle);
                  setHits([]);
                }}
                style={[styles.hit, { borderColor: t.border }]}
              >
                <Text allowFontScaling={false} style={{ color: t.textPrimary, ...typeScale.body }}>
                  {u.name} · @{u.handle}
                </Text>
              </Pressable>
            ))}
            {picked ? (
              <Text allowFontScaling={false} style={[styles.hint, { color: t.textSecondary }]}>
                Selected @{picked.handle}
              </Text>
            ) : null}

            <View style={styles.chipRow}>
              {(
                [
                  ['PERCENTAGE', '% of revenue'],
                  ['FIXED_PER_CONVERSION', `Fixed (${meta.currency})`],
                  ['NONE', 'None'],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    hapticTap();
                    setCommissionType(key);
                  }}
                  style={[
                    styles.chip,
                    {
                      borderColor: commissionType === key ? t.textPrimary : t.border,
                      backgroundColor: commissionType === key ? t.surfaceMuted : 'transparent',
                    },
                  ]}
                >
                  <Text allowFontScaling={false} style={{ color: t.textPrimary, ...typeScale.caption }}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {commissionType !== 'NONE' ? (
              <>
                <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
                  {commissionType === 'PERCENTAGE'
                    ? 'Enter percent (e.g. 12.5). Stored as basis points.'
                    : `Enter fixed amount in ${meta.currency} (e.g. 50.00).`}
                </Text>
                <TextInput
                  value={commissionInput}
                  onChangeText={setCommissionInput}
                  keyboardType="decimal-pad"
                  placeholder={commissionType === 'PERCENTAGE' ? '12.5' : '50'}
                  placeholderTextColor={t.textMuted}
                  style={inputStyle(t)}
                  accessibilityLabel="Commission value"
                />
              </>
            ) : null}
            <GlowButton
              label={busy ? 'Assigning…' : 'Assign creator'}
              onPress={() => void onAssign()}
              disabled={busy || !picked}
              compact
            />
          </StudioSection>
        ) : null}

        {tab === 'links' ? (
          <StudioSection title="Referral links">
            {links.length === 0 ? (
              <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
                Generate a link from the Creators tab after assigning someone.
              </Text>
            ) : (
              links.map((link) => (
                <Pressable
                  key={link.id}
                  onPress={() => void Share.share({ message: link.shareUrl })}
                  style={[styles.rowCard, { borderColor: t.border }]}
                >
                  <Text allowFontScaling={false} style={[styles.rowTitle, { color: t.textPrimary }]} numberOfLines={1}>
                    {link.shareUrl}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.rowMeta, { color: t.textMuted }]}>
                    {link.status} · tap to share
                  </Text>
                </Pressable>
              ))
            )}
          </StudioSection>
        ) : null}

        {tab === 'links' ? (
          <StudioSection title="Coupons">
            {coupons.map((c) => (
              <View key={c.id} style={[styles.rowCard, { borderColor: t.border }]}>
                <Text allowFontScaling={false} style={[styles.rowTitle, { color: t.textPrimary }]}>
                  {c.code}
                </Text>
                <Text allowFontScaling={false} style={[styles.rowMeta, { color: t.textMuted }]}>
                  {c.status} · {c.redemptionCount}
                  {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ''} redemptions
                </Text>
              </View>
            ))}
            <Text allowFontScaling={false} style={[styles.formHeading, { color: t.textPrimary }]}>
              New coupon
            </Text>
            {creators.length > 0 ? (
              <View style={styles.chipRow}>
                {creators.map((c) => (
                  <Pressable
                    key={c.creatorProfileId}
                    onPress={() => setCouponCreatorId(c.creatorProfileId)}
                    style={[
                      styles.chip,
                      {
                        borderColor:
                          couponCreatorId === c.creatorProfileId ? t.textPrimary : t.border,
                        backgroundColor:
                          couponCreatorId === c.creatorProfileId ? t.surfaceMuted : 'transparent',
                      },
                    ]}
                  >
                    <Text allowFontScaling={false} style={{ color: t.textPrimary, ...typeScale.caption }}>
                      @{c.creatorHandle}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
                Assign a creator to start generating referral traffic
              </Text>
            )}
            <TextInput
              value={couponCode}
              onChangeText={setCouponCode}
              placeholder="SUMMER20"
              placeholderTextColor={t.textMuted}
              autoCapitalize="characters"
              style={inputStyle(t)}
              accessibilityLabel="Coupon code"
            />
            {couponCode.trim() ? (
              <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
                Preview: {previewCouponCode(couponCode)}
              </Text>
            ) : null}
            <GlowButton
              label={busy ? 'Creating…' : 'Create coupon'}
              onPress={() => void onCoupon()}
              disabled={busy || creators.length === 0}
              compact
            />
          </StudioSection>
        ) : null}

        {tab === 'geography' ? (
          <StudioSection title="Where conversions are happening">
            {geo.length === 0 ? (
              <Text allowFontScaling={false} style={[styles.hint, { color: t.textMuted }]}>
                Not enough regional conversion data yet.
              </Text>
            ) : (
              geo.map((bucket) => (
                <View
                  key={`${bucket.coarseBucket}-${bucket.regionLabel}`}
                  style={[styles.geoRow, { borderColor: t.border }]}
                >
                  <Text allowFontScaling={false} style={[styles.geoTitle, { color: t.textPrimary }]}>
                    {bucket.regionLabel || bucket.coarseBucket}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.geoMeta, { color: t.textSecondary }]}>
                    {bucket.conversionCount.toLocaleString('en-IN')} conversions
                  </Text>
                  <Text allowFontScaling={false} style={[styles.geoMeta, { color: t.textMuted }]}>
                    {formatMinorCurrency(bucket.grossRevenueMinor, meta.currency)} revenue
                  </Text>
                </View>
              ))
            )}
          </StudioSection>
        ) : null}
      </ScrollView>
    </View>
  );
}

function commissionLabel(row: CreatorCampaignStatRow): string {
  if (row.commissionType === 'PERCENTAGE') return `${(row.commissionValue / 100).toFixed(1)}%`;
  if (row.commissionType === 'FIXED_PER_CONVERSION') {
    return formatMinorCurrency(row.commissionValue, 'INR') + ' / conv';
  }
  return 'No commission';
}

function BackChip({ onPress }: { onPress: () => void }): React.JSX.Element {
  const t = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="Back to Sponsor Studio"
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

function inputStyle(t: ReturnType<typeof useThemeColors>) {
  return {
    color: t.textPrimary,
    borderColor: t.border,
    backgroundColor: t.inputBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    ...typeScale.body,
  } as const;
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
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    ...typeScale.caption,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  title: { ...typeScale.display, fontWeight: '700', marginTop: 4 },
  sub: { ...typeScale.body, marginTop: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginVertical: space.md },
  error: { ...typeScale.caption, marginBottom: space.sm },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.sm },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: { ...typeScale.caption, fontWeight: '600' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  hint: { ...typeScale.body, marginTop: space.sm },
  rowCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.md,
    gap: 4,
    marginBottom: space.sm,
  },
  rowTitle: { ...typeScale.cardTitle, fontWeight: '700' },
  rowMeta: { ...typeScale.caption },
  inlineAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: space.sm,
  },
  inlineActionText: { ...typeScale.caption, fontWeight: '600' },
  formHeading: { ...typeScale.label, fontWeight: '700', marginTop: space.lg, marginBottom: space.xs },
  hit: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space.sm,
    marginTop: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginVertical: space.sm },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  geoRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.md,
    gap: 2,
  },
  geoTitle: { ...typeScale.title, fontWeight: '700' },
  geoMeta: { ...typeScale.body },
});
