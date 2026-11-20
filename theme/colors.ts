/**
 * CLASH 2.0 — colour tokens.
 * Primary background is #08080B (CLASH_SPEC.md §4 — Apple-inspired "Liquid Glass" dark UI).
 * Arena stays energetic; Vault will reuse the same primitives with calmer accents.
 */

export const color = {
  /** Primary app background. */
  bg: '#09090B',
  /** Primary solid surface (cards, bars). */
  surface: '#111113',
  /** Elevated solid surface (sheets, menus). */
  elevated: '#18181B',
  /** Modal / overlay scrim. */
  scrim: 'rgba(9,9,11,0.72)',
} as const;

/** Translucent fills + hairlines that make glass read as glass. */
export const glass = {
  fillSoft: 'rgba(255,255,255,0.020)',
  fill: 'rgba(255,255,255,0.040)',
  fillStrong: 'rgba(255,255,255,0.060)',
  borderFaint: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.12)',
} as const;

/** Apple-reference card ramp: frosted obsidian plates with lit hairlines. */
export const apple = {
  /** Solid neutral surface (no glass). */
  card: '#111113',
  cardSolid: '#111113',
  cardBorder: 'rgba(255,255,255,0.06)',
  cardSheen: 'rgba(255,255,255,0)',
  dock: '#0E0E10',
  pill: '#F5F5F5',
  pillText: '#09090B',
} as const;

/** Text ramp tuned for high contrast on #08080B. */
export const ink = {
  primary: '#F5F5F5',
  secondary: '#A1A1AA',
  tertiary: '#71717A',
  quaternary: '#4B4B52',
  /** Text placed on a bright accent fill. */
  inverse: '#09090B',
} as const;

/**
 * Feed card surfaces (reference "Arena Home"): solid matte obsidian plates on the
 * #08080B canvas, defined by a 1px hairline rather than a drop shadow.
 */
export const card = {
  /** Opaque primary surface. */
  solid: '#111113',
  /** Elevated surface for sheets/menus. */
  elevated: '#18181B',
  /** The hairline that draws the card edge. */
  border: 'rgba(255,255,255,0.06)',
  /** Subtle translucent alternative. */
  fill: 'rgba(255,255,255,0.03)',
  /** Native surface with subtle border. */
  native: '#111113',
} as const;

/** Primary action pill (reference design). */
export const action = {
  /** Primary action: near-white fill, dark text. */
  fill: '#F5F5F5',
  text: '#09090B',
  /** Secondary action: dark neutral surface, hairline border. */
  darkFill: '#18181B',
  darkText: '#F5F5F5',
  darkBorder: 'rgba(255,255,255,0.10)',
} as const;

/** Duel accents. A and B must always be distinguishable at a glance. */
export const accent = {
  a: '#A580FF',
  b: '#3D8BFF',
  gold: '#C9A96A',
  violet: '#A580FF',
  mint: '#3FBF8F',
  danger: '#E5484D',
} as const;

/**
 * The duel palette (reference screens 7–9): Side A is violet, Side B is electric
 * blue. Deliberately its own room — the warm Arena accents never leak into a
 * Clash, so "which side am I backing?" is answerable from colour alone.
 */
export const duel = {
  a: '#A580FF',
  aSoft: 'rgba(165,128,255,0.12)',
  aLine: 'rgba(165,128,255,0.32)',
  b: '#3D8BFF',
  bSoft: 'rgba(61,139,255,0.12)',
  bLine: 'rgba(61,139,255,0.32)',
} as const;

/** Low-alpha companions to the accents (chip fills, borders, glows). */
export const tint = {
  aSoft: 'rgba(165,128,255,0.12)',
  aLine: 'rgba(165,128,255,0.32)',
  bSoft: 'rgba(61,139,255,0.12)',
  bLine: 'rgba(61,139,255,0.32)',
  goldSoft: 'rgba(201,169,106,0.14)',
  violetSoft: 'rgba(165,128,255,0.12)',
  mintSoft: 'rgba(63,191,143,0.14)',
  neutralSoft: 'rgba(255,255,255,0.05)',
} as const;

export type GradientColors = readonly [string, string, ...string[]];

export const gradient: Record<
  'sideA' | 'sideB' | 'gold' | 'glass' | 'violet',
  GradientColors
> = {
  sideA: ['#8B7BD8', '#6C63C9'],
  sideB: ['#5B8FD6', '#4A6FA8'],
  gold: ['#C9B88A', '#A98F5F'],
  glass: ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.01)'],
  violet: ['#8B7BD8', '#6C63C9'],
} as const;
