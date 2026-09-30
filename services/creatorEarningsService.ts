/**
 * Creator Earnings — own campaign performance, commission totals, share assets.
 *
 * No payout mutations. Amounts are server-authored ledger figures only.
 * Never fetch raw conversions, attributions, geo, or buyer identity.
 */

import { requestError, requireSupabase, SupabaseError } from './supabaseClient';
import { formatMinorCurrency, referralShareUrl } from './sponsorService';
import type {
  CommissionType,
  SponsorCampaignStatus,
} from '../supabase/types';

export type { CommissionType, SponsorCampaignStatus };

export interface CreatorEarningsSummary {
  currency: string;
  campaignCount: number;
  clicks: number;
  attributedConversions: number;
  pendingCommissionMinor: number;
  approvedCommissionMinor: number;
  rejectedCommissionMinor: number;
  voidCommissionMinor: number;
  /** Pending + approved in summary currency (not paid out). */
  totalEarnedMinor: number;
}

export interface CreatorCampaignEarning {
  campaignId: string;
  campaignTitle: string;
  advertiserName: string;
  campaignStatus: SponsorCampaignStatus;
  currency: string;
  startsAt: string | null;
  endsAt: string | null;
  commissionType: CommissionType;
  commissionValue: number;
  assignmentStatus: string;
  clicks: number;
  attributedConversions: number;
  pendingCommissionMinor: number;
  approvedCommissionMinor: number;
  rejectedCommissionMinor: number;
  voidCommissionMinor: number;
}

export interface CreatorReferralAsset {
  id: string;
  campaignId: string;
  token: string;
  status: string;
  shareUrl: string;
  createdAt: string;
}

export interface CreatorCouponAsset {
  id: string;
  campaignId: string;
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

export { formatMinorCurrency };

/** Display commission from stored type + value (bp or minor units). */
export function formatCommissionLabel(
  type: CommissionType,
  value: number,
  currency = 'INR',
): string {
  if (type === 'PERCENTAGE') {
    const pct = value / 100;
    const pretty = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
    return `${pretty}% per conversion`;
  }
  if (type === 'FIXED_PER_CONVERSION') {
    return `${formatMinorCurrency(value, currency)} per conversion`;
  }
  return 'No commission';
}

export function formatCampaignPeriod(
  startsAt: string | null,
  endsAt: string | null,
): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  if (startsAt && endsAt) return `${fmt(startsAt)} – ${fmt(endsAt)}`;
  if (startsAt) return `From ${fmt(startsAt)}`;
  if (endsAt) return `Until ${fmt(endsAt)}`;
  return 'Open dates';
}

export async function fetchCreatorEarningsSummary(): Promise<CreatorEarningsSummary> {
  const { data, error } = await requireSupabase().rpc('creator_earnings_summary');
  if (error) throw requestError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    throw new SupabaseError('creator_earnings_summary returned no row', 'bad_payload');
  }
  const r = row as Record<string, unknown>;
  return {
    currency: asStr(r.currency, 'INR'),
    campaignCount: asInt(r.campaign_count),
    clicks: asInt(r.clicks),
    attributedConversions: asInt(r.attributed_conversions),
    pendingCommissionMinor: asInt(r.pending_commission_minor),
    approvedCommissionMinor: asInt(r.approved_commission_minor),
    rejectedCommissionMinor: asInt(r.rejected_commission_minor),
    voidCommissionMinor: asInt(r.void_commission_minor),
    totalEarnedMinor: asInt(r.total_earned_minor),
  };
}

export async function fetchCreatorCampaignEarnings(): Promise<CreatorCampaignEarning[]> {
  const { data, error } = await requireSupabase().rpc('creator_campaign_stats');
  if (error) throw requestError(error);
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      campaignId: asStr(r.campaign_id),
      campaignTitle: asStr(r.campaign_title),
      advertiserName: asStr(r.advertiser_name),
      campaignStatus: asStr(r.campaign_status, 'DRAFT') as SponsorCampaignStatus,
      currency: asStr(r.currency, 'INR'),
      startsAt: asNullableStr(r.starts_at),
      endsAt: asNullableStr(r.ends_at),
      commissionType: asStr(r.commission_type, 'NONE') as CommissionType,
      commissionValue: asInt(r.commission_value),
      assignmentStatus: asStr(r.assignment_status),
      clicks: asInt(r.clicks),
      attributedConversions: asInt(r.attributed_conversions),
      pendingCommissionMinor: asInt(r.pending_commission_minor),
      approvedCommissionMinor: asInt(r.approved_commission_minor),
      rejectedCommissionMinor: asInt(r.rejected_commission_minor),
      voidCommissionMinor: asInt(r.void_commission_minor),
    };
  });
}

export async function fetchMyReferralAssets(
  campaignId?: string,
): Promise<CreatorReferralAsset[]> {
  const { data, error } = await requireSupabase().rpc('creator_my_referral_links', {
    p_campaign_id: campaignId ?? undefined,
  });
  if (error) throw requestError(error);
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = row as Record<string, unknown>;
    const token = asStr(r.token);
    return {
      id: asStr(r.id),
      campaignId: asStr(r.campaign_id),
      token,
      status: asStr(r.status),
      shareUrl: referralShareUrl(token),
      createdAt: asStr(r.created_at),
    };
  });
}

export async function fetchMyCouponAssets(
  campaignId?: string,
): Promise<CreatorCouponAsset[]> {
  const { data, error } = await requireSupabase().rpc('creator_my_coupons', {
    p_campaign_id: campaignId ?? undefined,
  });
  if (error) throw requestError(error);
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: asStr(r.id),
      campaignId: asStr(r.campaign_id),
      code: asStr(r.code),
      status: asStr(r.status),
      maxRedemptions: typeof r.max_redemptions === 'number' ? r.max_redemptions : null,
      redemptionCount: asInt(r.redemption_count),
      createdAt: asStr(r.created_at),
    };
  });
}
