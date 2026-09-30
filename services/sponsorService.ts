/**
 * Sponsor Studio — advertiser read + management APIs (Phase 10 Step 2).
 *
 * Writes go through ownership-checked RPCs only. Never fetch raw conversion
 * rows or buyer identity. Conversion ingestion remains service_role-only.
 */

import { requestError, requireSupabase, SupabaseError } from './supabaseClient';
import type {
  CommissionType,
  SponsorCampaignStatus,
  SponsorCampaignType,
} from '../supabase/types';

export interface Advertiser {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface StudioOverview {
  advertiserId: string;
  activeCampaigns: number;
  totalCampaigns: number;
  clicks: number;
  conversions: number;
  attributedConversions: number;
  grossRevenueMinor: number;
  creatorCommissionMinor: number;
}

export interface CampaignListItem {
  campaignId: string;
  title: string;
  status: SponsorCampaignStatus;
  campaignType: SponsorCampaignType;
  currency: string;
  startsAt: string | null;
  endsAt: string | null;
  clicks: number;
  conversions: number;
  attributedConversions: number;
  grossRevenueMinor: number;
  creatorCommissionMinor: number;
}

export interface AdvertiserCampaignSummary {
  campaignId: string;
  clicks: number;
  conversions: number;
  attributedConversions: number;
  grossRevenueMinor: number;
  creatorCommissionMinor: number;
}

export interface AdvertiserGeoBucket {
  regionLabel: string;
  coarseBucket: string;
  conversionCount: number;
  grossRevenueMinor: number;
}

export interface CreatorCampaignStatRow {
  creatorProfileId: string;
  creatorHandle: string;
  creatorName: string;
  clicks: number;
  attributedConversions: number;
  commissionAccruedMinor: number;
  commissionType: CommissionType;
  commissionValue: number;
  assignmentStatus: string;
}

export interface ReferralLinkRow {
  id: string;
  campaignId: string;
  creatorProfileId: string;
  token: string;
  status: string;
  shareUrl: string;
  createdAt: string;
}

export interface CouponRow {
  id: string;
  campaignId: string;
  creatorProfileId: string;
  code: string;
  status: string;
  maxRedemptions: number | null;
  redemptionCount: number;
  createdAt: string;
}

function asInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function asStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableStr(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Format minor currency units for display (INR paise → ₹). */
export function formatMinorCurrency(minor: number, currency = 'INR'): string {
  const major = minor / 100;
  if (currency === 'INR') {
    return `₹${major.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
  return `${currency} ${major.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** User-facing percent → basis points (12.5 → 1250). */
export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}

/** Canonical coupon preview matching server normalize rules. */
export function previewCouponCode(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

export function referralShareUrl(token: string): string {
  return `https://clash.app/r/${token}`;
}

export async function fetchMyAdvertisers(): Promise<readonly Advertiser[]> {
  const { data, error } = await requireSupabase()
    .from('advertisers')
    .select('id, name, slug, status')
    .order('created_at', { ascending: false });
  if (error) throw requestError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: String(row.status),
  }));
}

export async function createAdvertiser(name: string, slug: string): Promise<Advertiser> {
  const { data, error } = await requireSupabase().rpc('create_advertiser', {
    p_name: name,
    p_slug: slug,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('create_advertiser returned no row', 'bad_payload');
  const row = data as { id: string; name: string; slug: string; status: string };
  return { id: row.id, name: row.name, slug: row.slug, status: String(row.status) };
}

export async function activateAdvertiser(advertiserId: string): Promise<Advertiser> {
  const { data, error } = await requireSupabase().rpc('activate_advertiser', {
    p_advertiser_id: advertiserId,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('activate_advertiser returned no row', 'bad_payload');
  const row = data as { id: string; name: string; slug: string; status: string };
  return { id: row.id, name: row.name, slug: row.slug, status: String(row.status) };
}

export async function fetchStudioOverview(advertiserId: string): Promise<StudioOverview> {
  const { data, error } = await requireSupabase().rpc('advertiser_studio_overview', {
    p_advertiser_id: advertiserId,
  });
  if (error) throw requestError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    throw new SupabaseError('advertiser_studio_overview returned no row', 'bad_payload');
  }
  const r = row as Record<string, unknown>;
  return {
    advertiserId: asStr(r.advertiser_id, advertiserId),
    activeCampaigns: asInt(r.active_campaigns),
    totalCampaigns: asInt(r.total_campaigns),
    clicks: asInt(r.clicks),
    conversions: asInt(r.conversions),
    attributedConversions: asInt(r.attributed_conversions),
    grossRevenueMinor: asInt(r.gross_revenue_minor),
    creatorCommissionMinor: asInt(r.creator_commission_minor),
  };
}

export async function fetchMyCampaigns(advertiserId: string): Promise<CampaignListItem[]> {
  const { data, error } = await requireSupabase().rpc('list_my_sponsor_campaigns', {
    p_advertiser_id: advertiserId,
  });
  if (error) throw requestError(error);
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      campaignId: asStr(r.campaign_id),
      title: asStr(r.title),
      status: asStr(r.status) as SponsorCampaignStatus,
      campaignType: asStr(r.campaign_type) as SponsorCampaignType,
      currency: asStr(r.currency, 'INR'),
      startsAt: asNullableStr(r.starts_at),
      endsAt: asNullableStr(r.ends_at),
      clicks: asInt(r.clicks),
      conversions: asInt(r.conversions),
      attributedConversions: asInt(r.attributed_conversions),
      grossRevenueMinor: asInt(r.gross_revenue_minor),
      creatorCommissionMinor: asInt(r.creator_commission_minor),
    };
  });
}

export async function fetchAdvertiserCampaignSummary(
  campaignId: string,
): Promise<AdvertiserCampaignSummary> {
  const { data, error } = await requireSupabase().rpc('advertiser_campaign_summary', {
    p_campaign_id: campaignId,
  });
  if (error) throw requestError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    throw new SupabaseError('advertiser_campaign_summary returned no row', 'bad_payload');
  }
  const r = row as Record<string, unknown>;
  return {
    campaignId: asStr(r.campaign_id, campaignId),
    clicks: asInt(r.clicks),
    conversions: asInt(r.conversions),
    attributedConversions: asInt(r.attributed_conversions),
    grossRevenueMinor: asInt(r.gross_revenue_minor),
    creatorCommissionMinor: asInt(r.creator_commission_minor),
  };
}

export async function fetchCampaignGeoSummary(
  campaignId: string,
): Promise<AdvertiserGeoBucket[]> {
  const { data, error } = await requireSupabase().rpc('advertiser_campaign_geo_summary', {
    p_campaign_id: campaignId,
  });
  if (error) throw requestError(error);
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      regionLabel: asStr(r.region_label),
      coarseBucket: asStr(r.coarse_bucket),
      conversionCount: asInt(r.conversion_count),
      grossRevenueMinor: asInt(r.gross_revenue_minor),
    };
  });
}

export async function fetchCampaignCreatorStats(
  campaignId: string,
): Promise<CreatorCampaignStatRow[]> {
  const { data, error } = await requireSupabase().rpc('advertiser_campaign_creator_stats', {
    p_campaign_id: campaignId,
  });
  if (error) throw requestError(error);
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      creatorProfileId: asStr(r.creator_profile_id),
      creatorHandle: asStr(r.creator_handle),
      creatorName: asStr(r.creator_name),
      clicks: asInt(r.clicks),
      attributedConversions: asInt(r.attributed_conversions),
      commissionAccruedMinor: asInt(r.commission_accrued_minor),
      commissionType: asStr(r.commission_type) as CommissionType,
      commissionValue: asInt(r.commission_value),
      assignmentStatus: asStr(r.assignment_status),
    };
  });
}

export async function createCampaign(input: {
  advertiserId: string;
  title: string;
  description?: string;
  campaignType?: SponsorCampaignType;
  currency?: string;
  startsAt?: string | null;
  endsAt?: string | null;
}): Promise<{ id: string; title: string; status: string }> {
  const args: {
    p_advertiser_id: string;
    p_title: string;
    p_description?: string;
    p_campaign_type?: SponsorCampaignType;
    p_currency?: string;
    p_starts_at?: string;
    p_ends_at?: string;
  } = {
    p_advertiser_id: input.advertiserId,
    p_title: input.title,
    p_description: input.description ?? '',
    p_campaign_type: input.campaignType ?? 'REFERRAL',
    p_currency: input.currency ?? 'INR',
  };
  if (input.startsAt) args.p_starts_at = input.startsAt;
  if (input.endsAt) args.p_ends_at = input.endsAt;
  const { data, error } = await requireSupabase().rpc('create_sponsor_campaign', args);
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('create_sponsor_campaign returned no row', 'bad_payload');
  const row = data as { id: string; title: string; status: string };
  return { id: row.id, title: row.title, status: String(row.status) };
}

export async function updateCampaign(input: {
  campaignId: string;
  title?: string;
  description?: string;
  startsAt?: string | null;
  endsAt?: string | null;
}): Promise<void> {
  const payload: {
    p_campaign_id: string;
    p_title?: string;
    p_description?: string;
    p_starts_at?: string;
    p_ends_at?: string;
    p_clear_starts?: boolean;
    p_clear_ends?: boolean;
  } = {
    p_campaign_id: input.campaignId,
  };
  if (input.title !== undefined) payload.p_title = input.title;
  if (input.description !== undefined) payload.p_description = input.description;
  if (input.startsAt !== undefined) {
    if (input.startsAt === null) payload.p_clear_starts = true;
    else payload.p_starts_at = input.startsAt;
  }
  if (input.endsAt !== undefined) {
    if (input.endsAt === null) payload.p_clear_ends = true;
    else payload.p_ends_at = input.endsAt;
  }
  const { error } = await requireSupabase().rpc('update_sponsor_campaign', payload);
  if (error) throw requestError(error);
}

export async function updateCreatorCommission(input: {
  campaignId: string;
  creatorProfileId: string;
  commissionType: CommissionType;
  commissionValue: number;
}): Promise<void> {
  const { error } = await requireSupabase().rpc('update_creator_commission', {
    p_campaign_id: input.campaignId,
    p_creator_profile_id: input.creatorProfileId,
    p_commission_type: input.commissionType,
    p_commission_value: input.commissionValue,
  });
  if (error) throw requestError(error);
}

export async function fetchCampaignMeta(campaignId: string): Promise<{
  id: string;
  advertiserId: string;
  title: string;
  description: string;
  status: SponsorCampaignStatus;
  campaignType: SponsorCampaignType;
  currency: string;
  startsAt: string | null;
  endsAt: string | null;
} | null> {
  const { data, error } = await requireSupabase()
    .from('sponsor_campaigns')
    .select(
      'id, advertiser_id, title, description, status, campaign_type, currency, starts_at, ends_at',
    )
    .eq('id', campaignId)
    .maybeSingle();
  if (error) throw requestError(error);
  if (!data) return null;
  return {
    id: data.id,
    advertiserId: data.advertiser_id,
    title: data.title,
    description: data.description ?? '',
    status: String(data.status) as SponsorCampaignStatus,
    campaignType: String(data.campaign_type) as SponsorCampaignType,
    currency: data.currency ?? 'INR',
    startsAt: data.starts_at ?? null,
    endsAt: data.ends_at ?? null,
  };
}

export async function setCampaignStatus(
  campaignId: string,
  status: SponsorCampaignStatus,
): Promise<void> {
  const { error } = await requireSupabase().rpc('set_sponsor_campaign_status', {
    p_campaign_id: campaignId,
    p_status: status,
  });
  if (error) throw requestError(error);
}

export async function pauseCampaign(campaignId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('pause_sponsor_campaign', {
    p_campaign_id: campaignId,
  });
  if (error) throw requestError(error);
}

export async function resumeCampaign(campaignId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('resume_sponsor_campaign', {
    p_campaign_id: campaignId,
  });
  if (error) throw requestError(error);
}

export async function assignCreator(input: {
  campaignId: string;
  creatorProfileId: string;
  commissionType: CommissionType;
  commissionValue: number;
}): Promise<void> {
  const { error } = await requireSupabase().rpc('assign_creator_to_campaign', {
    p_campaign_id: input.campaignId,
    p_creator_profile_id: input.creatorProfileId,
    p_commission_type: input.commissionType,
    p_commission_value: input.commissionValue,
  });
  if (error) throw requestError(error);
}

export async function removeCreator(campaignId: string, creatorProfileId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('remove_creator_from_campaign', {
    p_campaign_id: campaignId,
    p_creator_profile_id: creatorProfileId,
  });
  if (error) throw requestError(error);
}

export async function createReferralLink(
  campaignId: string,
  creatorProfileId: string,
): Promise<ReferralLinkRow> {
  const { data, error } = await requireSupabase().rpc('create_campaign_referral_link', {
    p_campaign_id: campaignId,
    p_creator_profile_id: creatorProfileId,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('create_campaign_referral_link returned no row', 'bad_payload');
  const row = data as {
    id: string;
    campaign_id: string;
    creator_profile_id: string;
    token: string;
    status: string;
    created_at: string;
  };
  return {
    id: row.id,
    campaignId: row.campaign_id,
    creatorProfileId: row.creator_profile_id,
    token: row.token,
    status: String(row.status),
    shareUrl: referralShareUrl(row.token),
    createdAt: row.created_at,
  };
}

export async function createCoupon(input: {
  campaignId: string;
  creatorProfileId: string;
  code: string;
  startsAt?: string | null;
  expiresAt?: string | null;
  maxRedemptions?: number | null;
}): Promise<CouponRow> {
  const args: {
    p_campaign_id: string;
    p_creator_profile_id: string;
    p_code: string;
    p_starts_at?: string;
    p_expires_at?: string;
    p_max_redemptions?: number;
  } = {
    p_campaign_id: input.campaignId,
    p_creator_profile_id: input.creatorProfileId,
    p_code: input.code,
  };
  if (input.startsAt) args.p_starts_at = input.startsAt;
  if (input.expiresAt) args.p_expires_at = input.expiresAt;
  if (input.maxRedemptions != null) args.p_max_redemptions = input.maxRedemptions;
  const { data, error } = await requireSupabase().rpc('create_campaign_coupon', args);
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('create_campaign_coupon returned no row', 'bad_payload');
  const row = data as {
    id: string;
    campaign_id: string;
    creator_profile_id: string;
    code: string;
    status: string;
    max_redemptions: number | null;
    redemption_count: number;
    created_at: string;
  };
  return {
    id: row.id,
    campaignId: row.campaign_id,
    creatorProfileId: row.creator_profile_id,
    code: row.code,
    status: String(row.status),
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    createdAt: row.created_at,
  };
}

export async function listReferralLinks(campaignId: string): Promise<ReferralLinkRow[]> {
  const { data, error } = await requireSupabase().rpc('list_campaign_referral_links', {
    p_campaign_id: campaignId,
  });
  if (error) throw requestError(error);
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = row as Record<string, unknown>;
    const token = asStr(r.token);
    return {
      id: asStr(r.id),
      campaignId: asStr(r.campaign_id),
      creatorProfileId: asStr(r.creator_profile_id),
      token,
      status: asStr(r.status),
      shareUrl: referralShareUrl(token),
      createdAt: asStr(r.created_at),
    };
  });
}

export async function listCoupons(campaignId: string): Promise<CouponRow[]> {
  const { data, error } = await requireSupabase().rpc('list_campaign_coupons', {
    p_campaign_id: campaignId,
  });
  if (error) throw requestError(error);
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: asStr(r.id),
      campaignId: asStr(r.campaign_id),
      creatorProfileId: asStr(r.creator_profile_id),
      code: asStr(r.code),
      status: asStr(r.status),
      maxRedemptions: typeof r.max_redemptions === 'number' ? r.max_redemptions : null,
      redemptionCount: asInt(r.redemption_count),
      createdAt: asStr(r.created_at),
    };
  });
}
