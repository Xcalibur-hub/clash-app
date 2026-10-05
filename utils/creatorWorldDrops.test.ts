import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  artifactCountLabel,
  dropActionLabel,
  dropDiscoveryHint,
  dropDiscoveryLine,
  dropIsEndingSoon,
  dropTypeLabel,
  hiddenChapterLine,
  rewardTypeLabel,
} from './creatorWorldDrops.ts';
import {
  WORLD_DESTINATION_PRESETS,
  WORLD_DROP_EXPIRY_DAYS,
  worldDestinationPreset,
  worldDropExpiryLabel,
} from './worldDestinations.ts';

describe('creator world drop presentation', () => {
  it('labels the supported drop types', () => {
    assert.equal(dropTypeLabel('SECRET_DROP'), 'Secret Drop');
    assert.equal(dropTypeLabel('CHALLENGE'), 'Challenge');
    assert.equal(dropTypeLabel('COLLECTIBLE'), 'Collectible');
    assert.equal(dropTypeLabel('CREATOR_UNLOCK'), 'Creator unlock');
  });

  it('labels rewards without inventing cash or tokens', () => {
    assert.equal(rewardTypeLabel('BADGE'), 'Badge');
    assert.equal(rewardTypeLabel('CONTENT_UNLOCK'), 'Content unlock');
    assert.equal(rewardTypeLabel('WORLD_ACCESS'), 'World access');
    assert.equal(rewardTypeLabel('CHALLENGE_STATUS'), 'Challenge status');
    assert.equal(rewardTypeLabel('COLLECTIBLE'), 'Collectible');
  });

  it('maps each type to its discovery verb', () => {
    assert.equal(dropActionLabel('SECRET_DROP'), 'FIND');
    assert.equal(dropActionLabel('CHALLENGE'), 'START CHALLENGE');
    assert.equal(dropActionLabel('COLLECTIBLE'), 'CLAIM');
    assert.equal(dropActionLabel('CREATOR_UNLOCK'), 'UNLOCK');
  });

  it('writes the discovery headline from the creator first name', () => {
    assert.equal(dropDiscoveryLine({ creatorName: 'Maya', dropType: 'SECRET_DROP' }), 'MAYA LEFT SOMETHING HERE');
    assert.equal(dropDiscoveryLine({ creatorName: 'Leo Vault', dropType: 'CHALLENGE' }), 'LEO SET A CHALLENGE');
    assert.equal(dropDiscoveryLine({ creatorName: null, dropType: 'COLLECTIBLE' }), 'A CREATOR HID A COLLECTIBLE');
  });

  it('composes the discovery hint from type and coarse place', () => {
    assert.equal(
      dropDiscoveryHint({ dropType: 'SECRET_DROP', locationLabel: 'Mumbai' }),
      'Secret Drop · Mumbai',
    );
    assert.equal(dropDiscoveryHint({ dropType: 'CHALLENGE', locationLabel: null }), 'Challenge');
  });

  it('summarises the hidden chapter and the collection', () => {
    assert.equal(hiddenChapterLine(3), '3 secrets are waiting');
    assert.equal(hiddenChapterLine(1), '1 secret is waiting');
    assert.equal(hiddenChapterLine(0), 'Nothing hidden right now');
    assert.equal(artifactCountLabel(2), '2 artifacts');
    assert.equal(artifactCountLabel(1), '1 artifact');
    assert.equal(artifactCountLabel(0), 'No artifacts yet');
  });

  it('flags a drop that is ending soon without flagging long windows', () => {
    const now = 1_000_000;
    assert.equal(dropIsEndingSoon(now + 3_600_000, now), true);
    assert.equal(dropIsEndingSoon(now + 5 * 24 * 3_600_000, now), false);
    assert.equal(dropIsEndingSoon(null, now), false);
    assert.equal(dropIsEndingSoon(now - 1, now), false);
  });

  it('offers coarse destination presets only', () => {
    assert.ok(WORLD_DESTINATION_PRESETS.length >= 8);
    for (const preset of WORLD_DESTINATION_PRESETS) {
      // Coarse by construction: two decimals at most is roughly a kilometre.
      const decimals = (value: number): number => (value.toString().split('.')[1] ?? '').length;
      assert.ok(decimals(preset.latitude) <= 2, `${preset.id} latitude must be coarse`);
      assert.ok(decimals(preset.longitude) <= 2, `${preset.id} longitude must be coarse`);
      assert.ok(Math.abs(preset.latitude) <= 90 && Math.abs(preset.longitude) <= 180);
      assert.ok(preset.label.length > 0);
    }
    assert.equal(worldDestinationPreset('mumbai')?.label, 'Mumbai');
    assert.equal(worldDestinationPreset('nowhere'), null);
  });

  it('keeps expiry options human', () => {
    assert.deepEqual([...WORLD_DROP_EXPIRY_DAYS], [7, 14, 30, null]);
    assert.equal(worldDropExpiryLabel(7), '7 days');
    assert.equal(worldDropExpiryLabel(1), '1 day');
    assert.equal(worldDropExpiryLabel(null), 'No expiry');
  });
});
