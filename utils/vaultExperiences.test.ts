import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isVaultExperienceEnterable,
  vaultExperienceAccessLabel,
  vaultExperienceHref,
} from './vaultExperiences.ts';

describe('Vault experiences', () => {
  it('maps enterable DROP COLLECTION COURSE SERVICE PRODUCT routes', () => {
    assert.equal(vaultExperienceHref({ type: 'DROP', id: 'd1' }), '/vault/drop/d1');
    assert.equal(
      vaultExperienceHref({ type: 'COLLECTION', id: 'c1' }),
      '/vault/collection/c1',
    );
    assert.equal(vaultExperienceHref({ type: 'COURSE', id: 'crs1' }), '/vault/course/crs1');
    assert.equal(vaultExperienceHref({ type: 'SERVICE', id: 'svc1' }), '/vault/service/svc1');
    assert.equal(vaultExperienceHref({ type: 'PRODUCT', id: 'prd1' }), '/vault/product/prd1');
  });

  it('does not invent routes for planned experience types', () => {
    assert.equal(isVaultExperienceEnterable('AI_FILM'), false);
    assert.equal(vaultExperienceHref({ type: 'AI_FILM', id: 'x' }), null);
    assert.equal(isVaultExperienceEnterable('INTERACTIVE_STORY'), false);
    assert.equal(vaultExperienceHref({ type: 'INTERACTIVE_STORY', id: 'x' }), null);
    assert.equal(vaultExperienceHref({ type: 'WORLD_DROP', id: 'w' }), null);
  });

  it('routes Creator AI into the creator AI room (Phase 15.5)', () => {
    assert.equal(isVaultExperienceEnterable('CREATOR_AI'), true);
    assert.equal(vaultExperienceHref({ type: 'CREATOR_AI', id: 'maya' }), '/vault/ai/maya');
    assert.equal(vaultExperienceHref({ type: 'CREATOR_AI', id: '' }), null);
  });

  it('labels access without inventing entitlement', () => {
    assert.equal(
      vaultExperienceAccessLabel({
        accessLevel: 'free',
        accessible: true,
        hasPreview: false,
      }),
      'FREE',
    );
    assert.equal(
      vaultExperienceAccessLabel({
        accessLevel: 'subscriber',
        accessible: false,
        hasPreview: true,
      }),
      'PREVIEW',
    );
  });
});
