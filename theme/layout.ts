/** 4/8pt spacing scale for a calmer, denser UI. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

/** Restrained corner radii (no 28px+ on every surface). */
export const radius = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 16,
  xl: 18,
  xxl: 24,
  /** Feed card corner. */
  card: 16,
  pill: 999,
} as const;

export const layout = {
  /** Horizontal screen padding. */
  screenX: 16,
  /** Minimum accessible touch target. */
  hit: 44,
  /** Vertical gap between Arena cards. */
  feedGap: 12,
  /** Internal padding inside a feed card. */
  cardPadding: 16,
} as const;

/**
 * AURA elevation ladder.
 *
 * Deliberately shallow: on a near-black canvas depth reads from *tonal
 * separation* and a hairline, not from a large blur. Three levels is enough
 * hierarchy and keeps Android rasterisation cheap on mid-range hardware.
 * `shadow*` values are for light mode; dark mode relies on `tone`.
 */
export const elevation = {
  /** Resting card on the canvas — hairline only. */
  flat: { shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  /** Raised: menus, floating chips. */
  raised: { shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  /** Overlay: sheets, docks. */
  overlay: { shadowOpacity: 0.28, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 8 },
} as const;

/**
 * Vertical rhythm. Editorial layouts need an explicit measure so paragraphs
 * and card stacks share one beat instead of ad-hoc margins.
 */
export const rhythm = {
  /** Height of one body line at the `body` step. */
  line: 24,
  /** Gap between a section heading and its content. */
  headingGap: 12,
  /** Gap between independent sections. */
  sectionGap: 32,
  /** Maximum readable text measure (approx 66 characters). */
  measure: 640,
} as const;

/** Editorial page margins — wider than a dense feed, narrower than a tablet. */
export const page = {
  gutters: 20,
  /** Content max width on tablets / foldables so lines never get too long. */
  maxContentWidth: 720,
} as const;
