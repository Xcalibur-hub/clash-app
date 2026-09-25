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
 * Type ramp for 8pt spacing system and flat dark UI:
 * Display sizes use 8pt increments for consistency.
 */
export const typeScale = {
  display: {
    fontFamily: family.sans,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  title: {
    fontFamily: family.sans,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  /**
   * Editorial italic headline — the reference design's section voice
   * ("For You", "Today's Takes").
   */
  editorial: {
    fontFamily: family.sans,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700',
    fontStyle: 'italic',
    letterSpacing: -0.7,
  },
  section: {
    fontFamily: family.sans,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  cardTitle: {
    fontFamily: family.sans,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  take: {
    fontFamily: family.sans,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  /**
   * Take text in feed cards: 20-22px, weight 700, tight line height (28px).
   * Also the Take itself on the take detail and duel panel — the single
   * highest-contrast line on any Take surface.
   */
  takeText: {
    fontFamily: family.sans,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  body: {
    fontFamily: family.sans,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: 0,
  },
  bodyStrong: {
    fontFamily: family.sans,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: 0,
  },
  label: {
    fontFamily: family.sans,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  /** Subtitles/metadata with reduced opacity for secondary information. */
  meta: {
    fontFamily: family.sans,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: 0.1,
  },
  /** Monospaced data: countdowns, jury scores, XP. Keeps numerals aligned. */
  data: {
    fontFamily: family.mono,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dataLg: {
    fontFamily: family.mono,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  /** Small uppercase eyebrow labels. */
  caption: {
    fontFamily: family.mono,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  /** Tracked uppercase mono eyebrow sitting above an editorial title. */
  eyebrow: {
    fontFamily: family.mono,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  button: {
    fontFamily: family.sans,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
} as const satisfies Record<string, TextStyle>;

export type TypeToken = keyof typeof typeScale;
