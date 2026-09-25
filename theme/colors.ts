/**
 * CLASH 2.0 — colour tokens.
 * Primary background is #08080B (CLASH_SPEC.md §4 — Apple-inspired "Liquid Glass" dark UI).
 * Arena stays energetic; Vault will reuse the same primitives with calmer accents.
 */

export const color = {
  /** Primary app background (spec). */
  bg: '#08080B',
  /** Modal / overlay scrim. */
  scrim: 'rgba(6,6,9,0.72)',
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
  card: 'rgba(20,20,24,0.72)',
  cardSolid: '#131318',
  cardBorder: 'rgba(255,255,255,0.09)',
  cardSheen: 'rgba(255,255,255,0.16)',
  dock: 'rgba(16,16,20,0.82)',
  pill: '#F5F5F7',
  pillText: '#0A0A0D',
} as const;

/** Text ramp tuned for high contrast on #08080B. */
export const ink = {
  primary: '#F7F7FA',
  secondary: 'rgba(247,247,250,0.66)',
  tertiary: 'rgba(247,247,250,0.44)',
  quaternary: 'rgba(247,247,250,0.26)',
  /** Text placed on a bright accent fill. */
  inverse: '#0A0A0D',
} as const;

/**
 * Feed card surfaces (reference "Arena Home"): solid matte obsidian plates on the
 * #08080B canvas, defined by a 1px hairline rather than a drop shadow.
 */
export const card = {
  /** Opaque plate fill - uses neutral surface. */
  solid: '#111114',
  /** The hairline that draws the card edge. */
  border: 'rgba(255,255,255,0.06)',
  /** Translucent alternative — lets the canvas bleed through. */
  fill: 'rgba(255,255,255,0.03)',
  /** Native surface with subtle border. */
  native: '#111114',
} as const;

/** Primary action pill (reference design). */
export const action = {
  /** Clean white pill with near-black text. */
  fill: '#FFFFFF',
  text: '#09090C',
  /** Solid matte-obsidian pill for the in-card CTA. */
  darkFill: '#09090C',
  darkText: '#F7F7FA',
  darkBorder: 'rgba(255,255,255,0.16)',
} as const;

/** Duel accents. A and B must always be distinguishable at a glance. */
export const accent = {
  a: '#FF6A3D',
  b: '#3D8BFF',
  gold: '#FFC861',
  violet: '#A580FF',
  mint: '#43D6A0',
  danger: '#FF4D5E',
} as const;

/**
 * The duel palette (reference screens 7–9): Side A is violet, Side B is electric
 * blue. Deliberately its own room — the warm Arena accents never leak into a
 * Clash, so "which side am I backing?" is answerable from colour alone.
 */
export const duel = {
  a: '#A580FF',
  aSoft: 'rgba(165,128,255,0.16)',
  aLine: 'rgba(165,128,255,0.45)',
  b: '#3D8BFF',
  bSoft: 'rgba(61,139,255,0.16)',
  bLine: 'rgba(61,139,255,0.45)',
} as const;

/** Low-alpha companions to the accents (chip fills, borders, glows). */
export const tint = {
  aSoft: 'rgba(255,106,61,0.16)',
  aLine: 'rgba(255,106,61,0.42)',
  bSoft: 'rgba(61,139,255,0.16)',
  bLine: 'rgba(61,139,255,0.42)',
  goldSoft: 'rgba(255,200,97,0.16)',
  violetSoft: 'rgba(165,128,255,0.18)',
  mintSoft: 'rgba(67,214,160,0.16)',
  neutralSoft: 'rgba(255,255,255,0.07)',
} as const;

export type GradientColors = readonly [string, string, ...string[]];

export const gradient: Record<
  'sideA' | 'sideB' | 'gold' | 'glass' | 'violet',
  GradientColors
> = {
  sideA: ['#FF8A4C', '#FF4D6A'],
  sideB: ['#57A0FF', '#7A6BFF'],
  gold: ['#FFE0A3', '#FFA53D'],
  glass: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)'],
  violet: ['#B794FF', '#6C63FF'],
} as const;
