/**
 * PROTOTYPE-ONLY catalog helpers (spec §20–§22).
 *
 * These read `data/mockCampaigns.ts` and the in-memory store — there is no
 * campaign or attribution backend yet, and this step deliberately does not build
 * one. They are isolated here so the production Vault API in
 * `services/vaultService.ts` contains nothing simulated: when the sponsor and
 * analytics surfaces get a real backend, this file is what disappears.
 *
 * Nothing here grants access to anything, and nothing here is authority.
 */

import type { Campaign, CityName, CityShare, SponsorOverview } from '../store/types';

/**
 * Roll every campaign's city split into one order-weighted distribution, so the
 * "audience" bars describe the whole book of business rather than one campaign.
 */
export function aggregateCities(campaigns: readonly Campaign[]): CityShare[] {
  const totals = new Map<CityName, number>();
  let weight = 0;
  for (const campaign of campaigns) {
    for (const slice of campaign.cities) {
      totals.set(slice.city, (totals.get(slice.city) ?? 0) + slice.share * campaign.orders);
    }
    weight += campaign.orders;
  }
  if (weight === 0) return [];
  const order: readonly CityName[] = ['Goa', 'Mumbai', 'Bangalore', 'Delhi', 'Other'];
  return order
    .filter((city) => totals.has(city))
    .map((city) => ({
      city,
      share: Math.round(((totals.get(city) ?? 0) / weight) * 100),
    }));
}

/** A roll-up of every campaign in scope (spec §22), over the simulated data. */
export function sponsorOverview(campaigns: readonly Campaign[]): SponsorOverview {
  let revenue = 0;
  let orders = 0;
  let redemptions = 0;
  let clicks = 0;
  const cityTotals = new Map<string, number>();
  const creatorTotals = new Map<string, number>();
  for (const campaign of campaigns) {
    revenue += campaign.gmv;
    orders += campaign.orders;
    redemptions += campaign.redemptions;
    clicks += campaign.clicks;
    creatorTotals.set(campaign.creatorId, (creatorTotals.get(campaign.creatorId) ?? 0) + campaign.gmv);
    for (const slice of campaign.cities) {
      cityTotals.set(slice.city, (cityTotals.get(slice.city) ?? 0) + slice.share * campaign.orders);
    }
  }
  let topCreatorId = campaigns[0]?.creatorId ?? '';
  let topCreatorGmv = -1;
  for (const [id, gmv] of creatorTotals) {
    if (gmv > topCreatorGmv) {
      topCreatorGmv = gmv;
      topCreatorId = id;
    }
  }
  let topCity = 'Goa';
  let topCityOrders = -1;
  for (const [city, value] of cityTotals) {
    if (value > topCityOrders) {
      topCityOrders = value;
      topCity = city;
    }
  }
  return {
    revenue,
    orders,
    redemptions,
    conversion: clicks > 0 ? `${((redemptions / clicks) * 100).toFixed(1)}%` : '0%',
    topCreatorId,
    topCity,
  };
}
