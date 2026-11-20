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
