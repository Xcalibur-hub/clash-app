import { Platform, type TextStyle } from 'react-native';

/**
 * iOS uses the native SF family (the "Apple-inspired" baseline for this product);
 * Android falls back to Roboto / system mono. No webfont download is required, so
 * the app boots instantly with no font flash.
 */
export const family = {
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }) as string,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
} as const;

/**
 * Type ramp from CLASH_SPEC.md §4:
 * display 32–40 · section 22–28 · card title 16–19 · body 14–16 · metadata 11–13.
 */
export const typeScale = {
  display: {
    fontFamily: family.sans,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -0.9,
  },
  title: {
    fontFamily: family.sans,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  /**
   * Editorial italic headline — the reference design's section voice
   * ("For You", "Today's Takes").
   */
  editorial: {
    fontFamily: family.sans,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '700',
    fontStyle: 'italic',
    letterSpacing: -0.8,
  },
  section: {
    fontFamily: family.sans,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  cardTitle: {
    fontFamily: family.sans,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  take: {
    fontFamily: family.sans,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  /**
   * The Take itself — the single highest-contrast line on a feed card
   * (reference "Arena Home").
   */
  quote: {
    fontFamily: family.sans,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  body: {
    fontFamily: family.sans,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    letterSpacing: 0,
  },
  bodyStrong: {
    fontFamily: family.sans,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: 0,
  },
  label: {
    fontFamily: family.sans,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  meta: {
    fontFamily: family.sans,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  /** Monospaced data: countdowns, jury scores, XP. Keeps numerals aligned. */
  data: {
    fontFamily: family.mono,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  dataLg: {
    fontFamily: family.mono,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  /** Small uppercase eyebrow labels. */
  caption: {
    fontFamily: family.mono,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  /** Tracked uppercase mono eyebrow sitting above an editorial title. */
  eyebrow: {
    fontFamily: family.mono,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
  button: {
    fontFamily: family.sans,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
} as const satisfies Record<string, TextStyle>;

export type TypeToken = keyof typeof typeScale;
