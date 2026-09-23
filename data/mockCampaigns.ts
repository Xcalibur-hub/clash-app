/**
 * Sponsor campaigns (spec §20–§22, §26 — 5 campaigns, 4 sponsors).
 *
 * The hero campaign NOVOCAINE20 uses the exact spec dataset:
 * 12,842 clicks · 1,281 redemptions · 1,034 orders · ₹8.4L GMV · 8.1% conv
 * Goa 34% · Mumbai 27% · Bangalore 18% · Delhi 9% · Other 12%.
 *
 * Everything here is SIMULATED CAMPAIGN DATA — never real transactions.
 */
import type { Campaign, CityShare } from '../store/types';

const NOVO_CITIES: readonly CityShare[] = [
  { city: 'Goa', share: 34 },
  { city: 'Mumbai', share: 27 },
  { city: 'Bangalore', share: 18 },
  { city: 'Delhi', share: 9 },
  { city: 'Other', share: 12 },
];

export const SIMULATED_LABEL = 'SIMULATED CAMPAIGN DATA';

export const CAMPAIGNS: readonly Campaign[] = [
  {
    id: 'cmp-novocaine20',
    code: 'NOVOCAINE20',
    sponsor: 'Nova',
    sponsorTint: '#A580FF',
    creatorId: 'c-maya',
    status: 'ACTIVE',
    clicks: 12_842,
    redemptions: 1281,
    orders: 1034,
    gmv: 840_000,
    cities: NOVO_CITIES,
    period: 'Last 30 days',
  },
  {
    id: 'cmp-cafearoma15',
    code: 'AROMA15',
    sponsor: 'Cafe Aroma',
    sponsorTint: '#FF9A4D',
    creatorId: 'c-zoya',
    status: 'ACTIVE',
    clicks: 8214,
    redemptions: 842,
    orders: 702,
    gmv: 421_000,
    cities: [
      { city: 'Goa', share: 41 },
      { city: 'Mumbai', share: 22 },
      { city: 'Bangalore', share: 15 },
      { city: 'Delhi', share: 8 },
      { city: 'Other', share: 14 },
    ],
    period: 'Last 30 days',
  },
  {
    id: 'cmp-kickstreet10',
    code: 'KICK10',
    sponsor: 'KickStreet',
    sponsorTint: '#3D8BFF',
    creatorId: 'c-kabir',
    status: 'ACTIVE',
    clicks: 6540,
    redemptions: 512,
    orders: 438,
    gmv: 318_000,
    cities: [
      { city: 'Goa', share: 18 },
      { city: 'Mumbai', share: 31 },
      { city: 'Bangalore', share: 24 },
      { city: 'Delhi', share: 15 },
      { city: 'Other', share: 12 },
    ],
    period: 'Last 30 days',
  },
  {
    id: 'cmp-fundwise5',
    code: 'WISE5',
    sponsor: 'FundWise',
    sponsorTint: '#43D6A0',
    creatorId: 'c-tanvi',
    status: 'ACTIVE',
    clicks: 4930,
    redemptions: 388,
    orders: 301,
    gmv: 186_000,
    cities: [
      { city: 'Goa', share: 21 },
      { city: 'Mumbai', share: 26 },
      { city: 'Bangalore', share: 29 },
      { city: 'Delhi', share: 12 },
      { city: 'Other', share: 12 },
    ],
    period: 'Last 30 days',
  },
  {
    id: 'cmp-nova-early',
    code: 'NOVAFOUNDING',
    sponsor: 'Nova',
    sponsorTint: '#A580FF',
    creatorId: 'c-riya',
    status: 'ENDED',
    clicks: 15_210,
    redemptions: 1640,
    orders: 1290,
    gmv: 1_120_000,
    cities: [
      { city: 'Goa', share: 29 },
      { city: 'Mumbai', share: 30 },
      { city: 'Bangalore', share: 20 },
      { city: 'Delhi', share: 11 },
      { city: 'Other', share: 10 },
    ],
    period: 'Oct cohort',
  },
];

/** Shared misc formatting for the campaign dataset (mock only). */
export function gmvLabel(gmv: number): string {
  const lakhs = gmv / 100_000;
  const text = lakhs >= 10 ? String(Math.round(lakhs)) : String(Math.round(lakhs * 10) / 10);
  return `₹${text}L`;
}

/** Mock INR lakhs: 840_000 → "₹8.4L". */
export function gmvLakhs(gmv: number): string {
  return gmvLabel(gmv);
}

export function conversionPct(campaign: Campaign): string {
  if (campaign.clicks <= 0) return '0%';
  return `${((campaign.redemptions / campaign.clicks) * 100).toFixed(1)}%`;
}
