/** 4pt spacing scale. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 26,
  xxxl: 34,
} as const;

/** Large, softly rounded corners (spec §4). */
export const radius = {
  xs: 10,
  sm: 14,
  md: 18,
  lg: 22,
  xl: 28,
  xxl: 34,
  /** Feed card corner (reference design: 20–24px). */
  card: 22,
  pill: 999,
} as const;

export const layout = {
  /** Horizontal screen padding. */
  screenX: 18,
  /** Minimum accessible touch target. */
  hit: 44,
  /** Vertical gap between Arena cards (24px as per redesign). */
  feedGap: 24,
  /** Internal padding inside a feed card (reference design: 20px). */
  cardPadding: 20,
} as const;
