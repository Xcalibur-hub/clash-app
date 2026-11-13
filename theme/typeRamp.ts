import type { TextStyle } from 'react-native';

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

/** Resolved by the platform at runtime; kept as a plain string so this module
 *  stays dependency-free and unit-testable. */
const systemSans = 'System';

/** Active font map — swapped to Inter once FontBootstrap loads faces. */
/**
 * Editorial serif — the AURA display voice.
 *
 * Deliberately the *platform* serif rather than a bundled webfont: no extra
 * download, no font-swap flash, and each OS renders its own optical-size cut
 * (iOS New York, Android Noto Serif). This is what gives headlines, Vault
 * creator identity and verdict moments a voice that Inter alone cannot carry.
 */
const serifStack = 'serif';

export const family = {
  regular: loaded.regular,
  medium: loaded.medium,
  semibold: loaded.semibold,
  bold: loaded.bold,
  /** Generic sans alias for legacy spreads — prefers Inter regular. */
  sans: loaded.regular,
  mono: 'monospace',
  systemSans,
  /** Platform serif — display/editorial only. */
  serif: serifStack,
} as const;

/**
 * Coherent type ramp — calm, premium, not bold-everywhere.
 * Weights live mostly at 400–700; display uses tighter tracking.
 */
export const typeScale = {
  display: {
    fontFamily: family.serif,
    fontSize: 33,
    lineHeight: 39,
    fontWeight: '600' as '600',
    letterSpacing: -0.7,
  },
  title: {
    fontFamily: family.semibold,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600' as '600',
    letterSpacing: -0.5,
  },
  /**
   * AURA display steps. `display` is the screen-level editorial headline;
   * `displayLg` is reserved for the one hero moment on a screen (Vault cover,
   * verdict result) so no surface competes with itself.
   */
  displayLg: {
    fontFamily: family.serif,
    fontSize: 42,
    lineHeight: 47,
    fontWeight: '600' as '600',
    letterSpacing: -1.0,
  },
  /** Section-level editorial line — serif, one step above `section`. */
  editorialLg: {
    fontFamily: family.serif,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '600' as '600',
    letterSpacing: -0.5,
  },
  /** Oversized quiet numeral for stats, timers, scores. */
  numeral: {
    fontFamily: family.serif,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '500' as '600',
    letterSpacing: -0.5,
  },
  /** Small-caps style eyebrow: uppercase, wide tracking, for kickers only. */
  kicker: {
    fontFamily: family.semibold,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600' as '600',
    letterSpacing: 1.4,
  },
  editorial: {
    fontFamily: family.serif,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600' as '600',
    letterSpacing: -0.45,
  },
  section: {
    fontFamily: family.semibold,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as '600',
    letterSpacing: -0.3,
  },
  cardTitle: {
    fontFamily: family.semibold,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as '600',
    letterSpacing: -0.2,
  },
  take: {
    fontFamily: family.medium,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500' as '600',
    letterSpacing: -0.15,
  },
  takeText: {
    fontFamily: family.semibold,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600' as '600',
    letterSpacing: -0.3,
  },
  body: {
    fontFamily: family.regular,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as '600',
    letterSpacing: -0.1,
  },
  bodyStrong: {
    fontFamily: family.medium,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500' as '600',
    letterSpacing: -0.1,
  },
  label: {
    fontFamily: family.medium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500' as '600',
    letterSpacing: -0.05,
  },
  meta: {
    fontFamily: family.regular,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as '600',
    letterSpacing: 0,
  },
  data: {
    fontFamily: family.mono,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as '600',
    letterSpacing: 0.2,
  },
  dataLg: {
    fontFamily: family.mono,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as '600',
    letterSpacing: -0.2,
  },
  caption: {
    fontFamily: family.medium,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500' as '600',
    letterSpacing: 0.2,
  },
  eyebrow: {
    fontFamily: family.medium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as '600',
    letterSpacing: 0.2,
  },
  button: {
    fontFamily: family.semibold,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600' as '600',
    letterSpacing: -0.1,
  },
  /** Sidebar / nav primary labels — ChatGPT-like density. */
  nav: {
    fontFamily: family.medium,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '500' as '600',
    letterSpacing: -0.2,
  },
} as const satisfies Record<string, TextStyle>;

export type TypeToken = keyof typeof typeScale;
