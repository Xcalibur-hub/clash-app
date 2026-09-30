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
}

/** Warm-white editorial light — not sterile pure white. */
export const lightTheme: SemanticTheme = {
  scheme: 'light',
  background: '#F4F3EF',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#EBEAE6',
  textPrimary: '#111113',
  textSecondary: '#52525B',
  textMuted: '#71717A',
  textInverse: '#FAFAF8',
  border: 'rgba(17,17,19,0.08)',
  borderStrong: 'rgba(17,17,19,0.14)',
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
  mediaScrim: ['transparent', 'rgba(8,8,11,0.28)', 'rgba(8,8,11,0.88)'],
  clashFill: '#111113',
  clashText: '#FAFAF8',
  shadowColor: '#111113',
  shadowOpacity: 0.12,
};

/** Matte obsidian dark — rich near-black, no neon. */
export const darkTheme: SemanticTheme = {
  scheme: 'dark',
  background: '#09090B',
  surface: '#111113',
  surfaceElevated: '#18181B',
  surfaceMuted: 'rgba(255,255,255,0.04)',
  textPrimary: '#F5F5F5',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',
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
};

export function paletteFor(scheme: ColorScheme): SemanticTheme {
  return scheme === 'light' ? lightTheme : darkTheme;
}
