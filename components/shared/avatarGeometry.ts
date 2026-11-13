/**
 * Avatar geometry — pure, testable, no React.
 *
 * Kept out of `Avatar.tsx` because Node's type-stripping runner cannot load
 * `.tsx`, and this geometry is the part worth asserting: Phase 1 blocker 3 was
 * initials clipped by a fixed-size circle once OS text scaling was turned on by
 * default.
 */

/**
 * Cap for the initials glyph.
 *
 * Scaling stays **enabled** — capping is not opting out. Making the avatar the
 * one element that ignores "Larger Text" would hurt exactly the users who asked
 * for it, so the glyph does grow, up to this multiplier.
 *
 * 1.6 is not arbitrary. The glyph is `0.36 * size`; with a 1.16 line box it must
 * stay inside 90% of the diameter to keep clearance from the rim:
 *
 *     0.36 * scale * 1.16 <= 0.90   →   scale <= 2.15
 *
 * 1.6 leaves comfortable margin below that ceiling while still honouring the
 * first three steps of both iOS and Android text-size settings, which is where
 * real users sit.
 */
export const AVATAR_MAX_TEXT_SCALE = 1.6;

/**
 * Initials font size for an avatar of `size`.
 *
 * A function of the *requested* size so the type stays proportional to the
 * avatar it belongs to — 88 in the profile header, 28 inline in a row.
 */
export function avatarInitialsSize(size: number, scale: number = AVATAR_MAX_TEXT_SCALE): number {
  return Math.round(size * 0.36 * scale);
}

/**
 * Share of the diameter the glyph's line box occupies at the scale cap.
 *
 * The avatar keeps its requested diameter (so it cannot break the layouts that
 * placed it), which means the whole fix rests on this ratio staying below 1.
 * Exported so the unit test asserts the real quantity rather than a proxy.
 */
export function avatarGlyphFootprint(size: number, scale: number = AVATAR_MAX_TEXT_SCALE): number {
  return (avatarInitialsSize(size, scale) * 1.16) / size;
}
