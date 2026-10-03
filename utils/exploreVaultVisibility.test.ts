import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  exploreVaultKindLabel,
  isExploreVaultVisible,
  normalizeExploreVaultAccess,
} from './exploreVaultVisibility.ts';

describe('Explore Vault visibility', () => {
  it('allows free and preview with public media paths', () => {
    assert.equal(
      isExploreVaultVisible({ accessLevel: 'free', publicMediaPath: 'a/b.jpg' }),
      true,
    );
    assert.equal(
      isExploreVaultVisible({ accessLevel: 'preview', publicMediaPath: 'a/teaser.jpg' }),
      true,
    );
  });

  it('rejects subscriber and missing public media', () => {
    assert.equal(
      isExploreVaultVisible({ accessLevel: 'subscriber', publicMediaPath: 'private/x.jpg' }),
      false,
    );
    assert.equal(isExploreVaultVisible({ accessLevel: 'free', publicMediaPath: null }), false);
    assert.equal(isExploreVaultVisible({ accessLevel: 'preview', publicMediaPath: '' }), false);
  });

  it('labels preview distinctly', () => {
    assert.equal(normalizeExploreVaultAccess('preview'), 'preview');
    assert.equal(exploreVaultKindLabel('preview'), 'VAULT PREVIEW');
    assert.equal(exploreVaultKindLabel('free'), 'VAULT');
  });
});
