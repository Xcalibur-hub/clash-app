/**
 * Avatar geometry contract (Phase 1 blocker 3).
 *
 * Phase 1 made OS font scaling the default and left `Avatar` with a fixed
 * diameter, a raw `<Text>` and `overflow: 'hidden'`. At large OS text the
 * initials were drawn bigger than the circle and sheared in half.
 *
 * The fix caps the glyph at `AVATAR_MAX_TEXT_SCALE` and sizes its line box to
 * that cap, so the avatar keeps its layout footprint while the text still
 * responds to the system setting. These assertions pin the geometry; whether the
 * cap is actually applied to the node is asserted in `auraAccessibility.test.ts`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AVATAR_MAX_TEXT_SCALE,
  avatarGlyphFootprint,
  avatarInitialsSize,
} from '../components/shared/avatarGeometry.ts';

describe('AURA avatar geometry', () => {
  it('keeps scaling enabled — the cap is not an opt-out', () => {
    assert.ok(AVATAR_MAX_TEXT_SCALE > 1, 'a cap of 1 would ignore Larger Text entirely');
    assert.ok(AVATAR_MAX_TEXT_SCALE <= 2, 'a 2x+ avatar would out-shout the username');
  });

  it('lets the glyph grow with the OS setting', () => {
    assert.ok(avatarInitialsSize(88, 1.3) > avatarInitialsSize(88, 1));
    assert.ok(avatarInitialsSize(88, 1.6) > avatarInitialsSize(88, 1.3));
  });

  it('keeps the glyph line box inside the circle at every size', () => {
    // The full sweep, not one sample: 28 is the smallest inline avatar and 112
    // the largest cover, and the ratio is size-independent by construction — the
    // assertion is here to prove that, not to assume it.
    for (const size of [24, 28, 32, 40, 56, 72, 88, 112]) {
      const footprint = avatarGlyphFootprint(size);
      assert.ok(
        footprint <= 0.9,
        `size ${size}: glyph line box uses ${(footprint * 100).toFixed(0)}% of the diameter, needs <= 90%`,
      );
    }
  });

  it('stays proportional across avatar sizes', () => {
    assert.equal(avatarInitialsSize(88, 1), Math.round(88 * 0.36));
    assert.ok(avatarInitialsSize(88, 1) > avatarInitialsSize(28, 1));
  });

  it('reports overflow past the safe ceiling', () => {
    // The safe ceiling is where the glyph's line box would fill the circle:
    //   0.36 * scale * 1.16 <= 0.90  ->  scale <= 2.15
    // Assert the formula agrees, so the 1.6 cap is demonstrably below the cliff
    // rather than coincidentally passing.
    assert.ok(avatarGlyphFootprint(88, 2.0) <= 0.9, '2.0x should still fit');
    assert.ok(avatarGlyphFootprint(88, 2.4) > 0.9, '2.4x must be reported as unsafe');
    assert.ok(AVATAR_MAX_TEXT_SCALE < 2.15, 'the cap must sit below the geometric ceiling');
  });
});
