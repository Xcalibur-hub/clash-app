/** 8pt spacing scale for flat dark UI. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
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
  screenX: 16,
  /** Minimum accessible touch target. */
  hit: 44,
  /** Vertical gap between Arena cards (32px for 8pt system). */
  feedGap: 32,
  /** Internal padding inside a feed card (16px for 8pt system). */
  cardPadding: 16,
} as const;
