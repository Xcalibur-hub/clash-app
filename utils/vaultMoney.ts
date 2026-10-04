/**
 * Vault commerce money helpers — integer minor units only (no floats).
 */

export type VaultCurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';

const SUPPORTED = new Set<string>(['INR', 'USD', 'EUR', 'GBP']);

export function normalizeVaultCurrency(raw: string | null | undefined): VaultCurrencyCode {
  const code = (raw ?? 'INR').trim().toUpperCase();
  return (SUPPORTED.has(code) ? code : 'INR') as VaultCurrencyCode;
}

export function isSupportedVaultCurrency(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return SUPPORTED.has(raw.trim().toUpperCase());
}

function formatMinor(minor: number, currency: VaultCurrencyCode): string {
  const major = minor / 100;
  if (currency === 'INR') {
    return `₹${major.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
  return `${currency} ${major.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Format catalog price from minor units. Null/undefined → null (caller shows FREE etc.). */
export function formatVaultPrice(
  amountMinor: number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (amountMinor == null || !Number.isFinite(amountMinor) || amountMinor < 0) return null;
  if (amountMinor === 0) return 'FREE';
  return formatMinor(Math.trunc(amountMinor), normalizeVaultCurrency(currency));
}

export type VaultOfferAccess = 'free' | 'subscriber' | 'paid' | 'contact';

/** Consumer-facing access / price line for offers. */
export function vaultOfferPriceLabel(input: {
  accessType: VaultOfferAccess;
  priceAmountMinor: number | null;
  currency: string | null;
  externalUrl?: string | null;
}): string {
  if (input.accessType === 'free') return 'FREE';
  if (input.accessType === 'subscriber') return 'Subscribers';
  if (input.accessType === 'contact') return 'Request';
  if (input.accessType === 'paid') {
    const price = formatVaultPrice(input.priceAmountMinor, input.currency);
    if (price) return price;
    if (input.externalUrl) return 'External store';
    return 'Paid';
  }
  return 'Request';
}
