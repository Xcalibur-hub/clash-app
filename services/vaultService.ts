/**
 * Mock payment + unlock services (spec §19, §28).
 *
 * paymentService / creatorService / sponsorService / analyticsService are the
 * seams a Supabase + UPI integration replaces later. Today they run on local
 * state with a simulated delay — no real money ever moves.
 */
import type { Campaign, CityName, CityShare, Creator, Drop, UnlockStatus } from '../store/types';

export type PayMethod = 'upi' | 'phonepe' | 'gpay' | 'other';

export const PAY_METHODS: readonly { id: PayMethod; label: string; hint: string }[] = [
  { id: 'upi', label: 'UPI', hint: 'yourname@bank' },
  { id: 'phonepe', label: 'PhonePe', hint: 'UPI via PhonePe' },
  { id: 'gpay', label: 'Google Pay', hint: 'UPI via GPay' },
  { id: 'other', label: 'Other UPI', hint: 'Any UPI app' },
];

export interface PaymentIntent {
  dropId: string;
  amount: number;
  method: PayMethod;
}

export interface PaymentReceipt {
  dropId: string;
  amount: number;
  method: PayMethod;
  confirmedAt: number;
}

const PAY_DELAY_MS = 1400;

/** Open a mock checkout — returns the intent the sheet confirms. */
export function createPayment(drop: Drop, method: PayMethod): PaymentIntent {
  return { dropId: drop.id, amount: drop.price, method };
}

/** Simulate the UPI round-trip. Always succeeds in the prototype. */
export function confirmPayment(intent: PaymentIntent): Promise<PaymentReceipt> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ ...intent, confirmedAt: Date.now() });
    }, PAY_DELAY_MS);
  });
}

/** Mark a drop unlocked once its receipt lands. */
export function unlockContent(dropId: string): UnlockStatus {
  void dropId;
  return 'unlocked';
}

/** Creator + sponsor + analytics reads over the mock datasets. */
export function creatorById(creators: readonly Creator[], id: string): Creator | undefined {
  return creators.find((creator) => creator.id === id);
}

export function dropsFor(creatorId: string, drops: readonly Drop[]): Drop[] {
  return drops.filter((drop) => drop.creatorId === creatorId);
}

export function campaignById(campaigns: readonly Campaign[], id: string): Campaign | undefined {
  return campaigns.find((campaign) => campaign.id === id);
}

export function activeCampaigns(campaigns: readonly Campaign[]): Campaign[] {
  return campaigns.filter((campaign) => campaign.status === 'ACTIVE');
}

export interface SponsorOverview {
  revenue: number;
  orders: number;
  redemptions: number;
  conversion: string;
  topCreatorId: string;
  topCity: string;
}

/** Roll every campaign's city split into one order-weighted distribution. */
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

/** Sponsor overview roll-up (spec §22) over simulated data. */
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
