import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isVaultDropFeedExpired,
  vaultDropAccessBadge,
  vaultDropDisplayAccess,
  vaultExpiryLabel,
  vaultPublicVisualMedia,
} from './vaultAccess.ts';

describe('Vault access presentation', () => {
  it('classifies FREE / PREVIEW / SUBSCRIBER / locked', () => {
    assert.equal(
      vaultDropDisplayAccess({
        accessLevel: 'free',
        accessible: true,
        hasPreviewMedia: false,
      }),
      'FREE',
    );
    assert.equal(
      vaultDropDisplayAccess({
        accessLevel: 'subscriber',
        accessible: false,
        hasPreviewMedia: true,
      }),
      'PREVIEW',
    );
    assert.equal(
      vaultDropDisplayAccess({
        accessLevel: 'subscriber',
        accessible: true,
        hasPreviewMedia: true,
      }),
      'SUBSCRIBER',
    );
    assert.equal(
      vaultDropDisplayAccess({
        accessLevel: 'subscriber',
        accessible: false,
        hasPreviewMedia: false,
      }),
      'SUBSCRIBER_LOCKED',
    );
  });

  it('never uses private media as the public visual', () => {
    const lockedPreview = vaultPublicVisualMedia({
      accessLevel: 'subscriber',
      accessible: false,
      publicMedia: null,
      previewMedia: { bucket: 'public-media', path: 'p/preview.jpg', kind: 'image' },
    });
    assert.equal(lockedPreview?.source, 'preview');
    assert.equal(lockedPreview?.path, 'p/preview.jpg');

    const free = vaultPublicVisualMedia({
      accessLevel: 'free',
      accessible: true,
      publicMedia: { bucket: 'public-media', path: 'p/free.jpg', kind: 'image' },
      previewMedia: null,
    });
    assert.equal(free?.source, 'public');

    const noLeak = vaultPublicVisualMedia({
      accessLevel: 'subscriber',
      accessible: false,
      publicMedia: null,
      previewMedia: null,
    });
    assert.equal(noLeak, null);
  });

  it('formats expiry in human units', () => {
    const now = Date.parse('2026-10-04T12:00:00.000Z');
    assert.equal(vaultExpiryLabel(now + 4 * 3_600_000, now), '4h left');
    assert.equal(vaultExpiryLabel(now + 25 * 60_000, now), '25m left');
    assert.equal(vaultDropAccessBadge('PREVIEW'), 'PREVIEW AVAILABLE');
  });

  it('detects feed expiry for stale client state', () => {
    const now = 1_000_000;
    assert.equal(isVaultDropFeedExpired(now - 1, now), true);
    assert.equal(isVaultDropFeedExpired(now + 1, now), false);
  });
});
