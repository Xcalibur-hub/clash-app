import { Platform, type TextStyle } from 'react-native';

/**
 * Inter is the CLASH UI face (loaded via @expo-google-fonts/inter).
 * Fallback to system sans if fonts have not finished loading.
 */
const loaded = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

const systemSans = Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }) as string;

/** Active font map — swapped to Inter once FontBootstrap loads faces. */
export const family = {
  regular: loaded.regular,
  medium: loaded.medium,
  semibold: loaded.semibold,
  bold: loaded.bold,
  /** Generic sans alias for legacy spreads — prefers Inter regular. */
  sans: loaded.regular,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
  systemSans,
} as const;

/**
 * Coherent type ramp — calm, premium, not bold-everywhere.
 * Weights live mostly at 400–700; display uses tighter tracking.
 */
export const typeScale = {
  display: {
    fontFamily: family.bold,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700' as TextStyle['fontWeight'],
    letterSpacing: -1.1,
  },
  title: {
    fontFamily: family.semibold,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600' as TextStyle['fontWeight'],
    letterSpacing: -0.5,
  },
  editorial: {
    fontFamily: family.semibold,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600' as TextStyle['fontWeight'],
    letterSpacing: -0.45,
  },
  section: {
    fontFamily: family.semibold,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as TextStyle['fontWeight'],
    letterSpacing: -0.3,
  },
  cardTitle: {
    fontFamily: family.semibold,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as TextStyle['fontWeight'],
    letterSpacing: -0.2,
  },
  take: {
    fontFamily: family.medium,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500' as TextStyle['fontWeight'],
    letterSpacing: -0.15,
  },
  takeText: {
    fontFamily: family.semibold,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600' as TextStyle['fontWeight'],
    letterSpacing: -0.3,
  },
  body: {
    fontFamily: family.regular,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as TextStyle['fontWeight'],
    letterSpacing: -0.1,
  },
  bodyStrong: {
    fontFamily: family.medium,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500' as TextStyle['fontWeight'],
    letterSpacing: -0.1,
  },
  label: {
    fontFamily: family.medium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500' as TextStyle['fontWeight'],
    letterSpacing: -0.05,
  },
  meta: {
    fontFamily: family.regular,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as TextStyle['fontWeight'],
    letterSpacing: 0,
  },
  data: {
    fontFamily: family.mono,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as TextStyle['fontWeight'],
    letterSpacing: 0.2,
  },
  dataLg: {
    fontFamily: family.mono,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as TextStyle['fontWeight'],
    letterSpacing: -0.2,
  },
  caption: {
    fontFamily: family.medium,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500' as TextStyle['fontWeight'],
    letterSpacing: 0.2,
  },
  eyebrow: {
    fontFamily: family.medium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as TextStyle['fontWeight'],
    letterSpacing: 0.2,
  },
  button: {
    fontFamily: family.semibold,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600' as TextStyle['fontWeight'],
    letterSpacing: -0.1,
  },
  /** Sidebar / nav primary labels — ChatGPT-like density. */
  nav: {
    fontFamily: family.medium,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '500' as TextStyle['fontWeight'],
    letterSpacing: -0.2,
  },
} as const satisfies Record<string, TextStyle>;

export type TypeToken = keyof typeof typeScale;
