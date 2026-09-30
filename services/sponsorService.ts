/**
 * Sponsor / advertiser attribution read APIs (Phase 10 Step 1).
 *
 * Screens must not invent buyer identity or exact location. Conversion ingestion
 * is service-role / Edge Function only — this module is read-only for the app.
 */

import { requestError, requireSupabase, SupabaseError } from './supabaseClient';

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

function asInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Aggregate campaign performance for the signed-in advertiser owner. */
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
    campaignId: String(r.campaign_id ?? campaignId),
    clicks: asInt(r.clicks),
    conversions: asInt(r.conversions),
    attributedConversions: asInt(r.attributed_conversions),
    grossRevenueMinor: asInt(r.gross_revenue_minor),
    creatorCommissionMinor: asInt(r.creator_commission_minor),
  };
}

/**
 * Privacy-safe geo aggregates. Server already hides buckets below the
 * MIN_GEO_AGGREGATE_COUNT threshold — never re-filter only in the UI.
 */
export async function fetchCampaignGeoSummary(
  campaignId: string,
): Promise<AdvertiserGeoBucket[]> {
  const { data, error } = await requireSupabase().rpc('advertiser_campaign_geo_summary', {
    p_campaign_id: campaignId,
  });
  if (error) throw requestError(error);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      regionLabel: String(r.region_label ?? ''),
      coarseBucket: String(r.coarse_bucket ?? ''),
      conversionCount: asInt(r.conversion_count),
      grossRevenueMinor: asInt(r.gross_revenue_minor),
    };
  });
}

/** Advertisers the signed-in profile owns (created_by). */
export async function fetchMyAdvertisers(): Promise<
  ReadonlyArray<{ id: string; name: string; slug: string; status: string }>
> {
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
