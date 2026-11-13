/**
 * Semantic colour palettes for Light and Dark.
 * Screens consume these via useTheme() — never hardcode isDark ternaries.
 */

export type ColorScheme = 'light' | 'dark';

export interface SemanticTheme {
  scheme: ColorScheme;
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  border: string;
  borderStrong: string;
  accent: string;
  danger: string;
  success: string;
  overlay: string;
  pill: string;
  pillText: string;
  pillInactive: string;
  pillInactiveText: string;
  tabBar: string;
  tabBarBorder: string;
  inputBackground: string;
  /** Bottom scrim stops for media overlays (transparent → opaque). */
  mediaScrim: readonly [string, string, string];
  clashFill: string;
  clashText: string;
  shadowColor: string;
  shadowOpacity: number;

  /* ── AURA additions ───────────────────────────────────────────────────────
   * Additive only: every field above is unchanged, so the 352 existing
   * components keep compiling. These exist so new surfaces can express
   * editorial hierarchy without inventing literals. */

  /** Faintest wash, for inset rows and skeletons. */
  surfaceSunken: string;
  /** Hairline that separates two surfaces of equal tone. */
  divider: string;
  /** Text on `surfaceSunken`. */
  textOnSunken: string;
  /** Primary brand ink — the Arena signature. */
  brand: string;
  brandSoft: string;
  /** Editorial/hero accent, used sparingly for one moment per screen. */
  signature: string;
  signatureSoft: string;
  /** Gold reserved for achievement (verdicts, rank, trophies). */
  gold: string;
  goldSoft: string;
  /** Side A / Side B — warm vs cool, instantly separable, never neon. */
  sideA: string;
  sideASoft: string;
  sideB: string;
  sideBSoft: string;
  /** Focus ring for keyboard / switch access. */
  focusRing: string;
}

/** Warm-white editorial light — not sterile pure white. */
export const lightTheme: SemanticTheme = {
  scheme: 'light',
  background: '#F2F0EB',
  surface: '#FFFEFA',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#E8E6E0',
  textPrimary: '#111113',
  textSecondary: '#52525B',
  textMuted: '#64646B',
  textInverse: '#FAFAF8',
  border: 'rgba(17,17,19,0.06)',
  borderStrong: 'rgba(17,17,19,0.12)',
  accent: '#C9A96A',
  danger: '#E5484D',
  success: '#2F9E6E',
  overlay: 'rgba(17,17,19,0.45)',
  pill: '#111113',
  pillText: '#FAFAF8',
  pillInactive: '#FFFFFF',
  pillInactiveText: '#52525B',
  tabBar: 'rgba(255,255,255,0.94)',
  tabBarBorder: 'rgba(17,17,19,0.08)',
  inputBackground: '#EFEFEE',
  mediaScrim: ['transparent', 'rgba(8,8,11,0.22)', 'rgba(8,8,11,0.78)'],
  clashFill: '#111113',
  clashText: '#FAFAF8',
  shadowColor: '#111113',
  shadowOpacity: 0.1,

  surfaceSunken: '#EDEAE3',
  divider: 'rgba(17,17,19,0.05)',
  textOnSunken: '#3F3F46',
  brand: '#B4552F',
  brandSoft: 'rgba(180,85,47,0.10)',
  signature: '#1E5F58',
  signatureSoft: 'rgba(30,95,88,0.10)',
  gold: '#8A6A2F',
  goldSoft: 'rgba(138,106,47,0.12)',
  sideA: '#B4552F',
  sideASoft: 'rgba(180,85,47,0.10)',
  sideB: '#2C5A86',
  sideBSoft: 'rgba(44,90,134,0.10)',
  focusRing: '#1E5F58',
};

/** Matte obsidian dark — rich near-black, no neon. */
export const darkTheme: SemanticTheme = {
  scheme: 'dark',
  background: '#0B0A09',
  surface: '#131211',
  surfaceElevated: '#1A1917',
  surfaceMuted: 'rgba(255,255,255,0.04)',
  textPrimary: '#F5F5F5',
  textSecondary: '#A1A1AA',
  textMuted: '#8A8A93',
  textInverse: '#09090B',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  accent: '#C9A96A',
  danger: '#E5484D',
  success: '#3FBF8F',
  overlay: 'rgba(9,9,11,0.72)',
  pill: '#F5F5F5',
  pillText: '#09090B',
  pillInactive: 'rgba(255,255,255,0.06)',
  pillInactiveText: '#A1A1AA',
  tabBar: 'rgba(14,14,16,0.94)',
  tabBarBorder: 'rgba(255,255,255,0.08)',
  inputBackground: '#18181B',
  mediaScrim: ['transparent', 'rgba(8,8,11,0.22)', 'rgba(8,8,11,0.92)'],
  clashFill: '#F5F5F5',
  clashText: '#09090B',
  shadowColor: '#000000',
  shadowOpacity: 0.35,

  surfaceSunken: 'rgba(255,255,255,0.02)',
  divider: 'rgba(255,255,255,0.05)',
  textOnSunken: '#8E8B94',
  brand: '#E0885E',
  brandSoft: 'rgba(224,136,94,0.12)',
  signature: '#6FB8AB',
  signatureSoft: 'rgba(111,184,171,0.12)',
  gold: '#D6B478',
  goldSoft: 'rgba(214,180,120,0.14)',
  sideA: '#E0885E',
  sideASoft: 'rgba(224,136,94,0.12)',
  sideB: '#7FA6CE',
  sideBSoft: 'rgba(127,166,206,0.12)',
  focusRing: '#6FB8AB',
};

export function paletteFor(scheme: ColorScheme): SemanticTheme {
  return scheme === 'light' ? lightTheme : darkTheme;
}
