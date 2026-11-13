/**
 * AURA text-scaling policy — pure, testable, no React.
 *
 * Kept separate from `AppText.tsx` so the policy can be unit-tested with Node's
 * type-stripping runner (which cannot load `.tsx`).
 */

export interface FontScaling {
  allowFontScaling: boolean;
  maxFontSizeMultiplier?: number;
}

/**
 * Decide whether a Text node follows the OS text-size setting.
 *
 * Default is **scaling on**. `fixed` is an explicit opt-out for text whose
 * layout cannot reflow (numeric counters in fixed chrome, single-glyph badges),
 * and it wins over a cap because a node cannot be both pinned and growable.
 */
export function resolveFontScaling(
  fixed: boolean | undefined,
  maxFontSizeMultiplier: number | undefined,
): FontScaling {
  if (fixed) return { allowFontScaling: false };
  return maxFontSizeMultiplier === undefined
    ? { allowFontScaling: true }
    : { allowFontScaling: true, maxFontSizeMultiplier };
}

/**
 * The reviewed budget for `allowFontScaling={false}` in the codebase.
 *
 * Was 1,218 occurrences across 261 files before AURA. Every remaining site lives
 * in a file whose layout is frozen by a design-contract test (Explore world
 * canvas, Arena fresh-take rails, duel stage chrome). Lowering this number is a
 * win; raising it needs a reason recorded here.
 */
export const FIXED_FONT_BUDGET = 71;
