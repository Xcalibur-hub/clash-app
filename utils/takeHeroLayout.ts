/**
 * Take detail hero layout.
 *
 * The hero is an editorial media plate with the Take copy overlaid at its
 * bottom. The plate keeps an intentional proportion, but it must never be
 * shorter than the copy it carries: the overlay is bottom-anchored, so a card
 * sized by a fixed magic number cuts the top of a long body (or a body scaled
 * up by the system font size) off. The card therefore grows to the measured
 * copy instead of trusting a hardcoded offset.
 *
 * Pure and React Native-free so the rule is unit-testable.
 */

/** Editorial proportion of the plate: a little taller than it is wide. */
const PLATE_RATIO = 1.12;

/** Bounds of the plate itself (before the copy is considered). */
const MIN_PLATE = 360;
const MAX_PLATE = 520;

const PLATE_FALLBACK_WIDTH = 360;

export interface HeroCardMetrics {
  /** Card width in dp (window width minus the screen margins). */
  cardWidth: number;
  /** Measured height of the copy overlay, including its own padding. */
  copyHeight: number;
}

/**
 * Height of the hero card: the plate proportion, or the measured copy when the
 * copy is taller — never less than either, never NaN.
 */
export function heroCardHeight({ cardWidth, copyHeight }: HeroCardMetrics): number {
  const usableWidth =
    Number.isFinite(cardWidth) && cardWidth > 0 ? cardWidth : PLATE_FALLBACK_WIDTH;
  const plate = Math.min(
    MAX_PLATE,
    Math.max(MIN_PLATE, Math.round(usableWidth * PLATE_RATIO)),
  );
  const copy = Number.isFinite(copyHeight) && copyHeight > 0 ? Math.ceil(copyHeight) : 0;
  return Math.max(plate, copy);
}
