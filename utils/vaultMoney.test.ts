import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatVaultPrice, vaultOfferPriceLabel } from './vaultMoney.ts';

describe('Vault money', () => {
  it('formats minor units without floats', () => {
    assert.equal(formatVaultPrice(49900, 'INR'), '₹499');
    assert.equal(formatVaultPrice(0, 'INR'), 'FREE');
    assert.equal(formatVaultPrice(null, 'INR'), null);
  });

  it('presents offer access lines', () => {
    assert.equal(
      vaultOfferPriceLabel({
        accessType: 'free',
        priceAmountMinor: null,
        currency: null,
      }),
      'FREE',
    );
    assert.equal(
      vaultOfferPriceLabel({
        accessType: 'subscriber',
        priceAmountMinor: null,
        currency: null,
      }),
      'Subscribers',
    );
    assert.equal(
      vaultOfferPriceLabel({
        accessType: 'paid',
        priceAmountMinor: 149900,
        currency: 'INR',
      }),
      '₹1,499',
    );
    assert.equal(
      vaultOfferPriceLabel({
        accessType: 'contact',
        priceAmountMinor: null,
        currency: null,
      }),
      'Request',
    );
  });
});
