/**
 * Creator earnings / campaign performance reads (Phase 10 Step 1).
 *
 * No payout mutations. Commission amounts are server-authored ledger figures.
 */

import { requestError, requireSupabase } from './supabaseClient';

export interface CreatorCampaignStat {
  campaignId: string;
  campaignTitle: string;
  advertiserName: string;
  clicks: number;
  attributedConversions: number;
  pendingCommissionMinor: number;
  approvedCommissionMinor: number;
}

function asInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Campaign-level stats for the signed-in creator (own assignments only). */
export async function fetchMyCreatorCampaignStats(): Promise<CreatorCampaignStat[]> {
  const { data, error } = await requireSupabase().rpc('creator_campaign_stats');
  if (error) throw requestError(error);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      campaignId: String(r.campaign_id ?? ''),
      campaignTitle: String(r.campaign_title ?? ''),
      advertiserName: String(r.advertiser_name ?? ''),
      clicks: asInt(r.clicks),
      attributedConversions: asInt(r.attributed_conversions),
      pendingCommissionMinor: asInt(r.pending_commission_minor),
      approvedCommissionMinor: asInt(r.approved_commission_minor),
    };
  });
}

/** Own commission ledger rows (status + amounts only — no buyer fields exist). */
export async function fetchMyCommissionLedger(): Promise<
  ReadonlyArray<{
    id: string;
    campaignId: string;
    amountMinor: number;
    currency: string;
    status: string;
    createdAt: string;
  }>
> {
  const { data, error } = await requireSupabase()
    .from('creator_commission_ledger')
    .select('id, campaign_id, amount_minor, currency, status, created_at')
    .order('created_at', { ascending: false });
  if (error) throw requestError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    campaignId: row.campaign_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    status: String(row.status),
    createdAt: row.created_at,
  }));
}
