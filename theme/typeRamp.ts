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

/**
 * Default platform families.
 *
 * These are *defaults*, not the final answer: `typography.ts` resolves the real
 * stacks with `Platform.select` and calls `buildTypeScale()` with them. The
 * defaults exist so this module stays dependency-free (no `react-native` import)
 * and can be unit-tested under Node's type stripper.
 *
 * The values below are the cross-platform fallbacks. `'serif'` is the generic
 * family that React Native maps per-OS on Android; iOS needs a real name
 * (`New York`), which is exactly why the resolved map must be injected rather
 * than frozen here. See `docs/aura/PHASE2-AUDIT.md` blocker 7.
 */
const defaultStacks = {
  serif: 'serif',
  mono: 'monospace',
  systemSans: 'System',
} as const;

export type FontStacks = {
  serif: string;
  mono: string;
  systemSans: string;
};

export const family = {
  regular: loaded.regular,
  medium: loaded.medium,
  semibold: loaded.semibold,
  bold: loaded.bold,
  /** Generic sans alias for legacy spreads — prefers Inter regular. */
  sans: loaded.regular,
  mono: defaultStacks.mono,
  systemSans: defaultStacks.systemSans,
  /** Platform serif — display/editorial only. */
  serif: defaultStacks.serif,
} as const;

/**
 * Build the type ramp from a resolved font-family map.
 *
 * This is a factory, not a constant, for one specific reason: the ramp embeds
 * `fontFamily`, and the correct family is only known once `Platform.select` has
 * run. Building the ramp here and then patching `family` afterwards (the Phase 1
 * arrangement) left every step on the generic fallback — 291 call sites silently
 * rendered in the wrong face. Passing the stacks in makes that class of bug
 * impossible to express.
 */
export function buildTypeScale(f: {
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
  mono: string;
  serif: string;
}): Record<string, TextStyle> {
  return {
  display: {
    fontFamily: f.serif,
    fontSize: 33,
    lineHeight: 39,
    fontWeight: '600' as '600',
    letterSpacing: -0.7,
  },
  title: {
    fontFamily: f.semibold,
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
    fontFamily: f.serif,
    fontSize: 42,
    lineHeight: 47,
    fontWeight: '600' as '600',
    letterSpacing: -1.0,
  },
  /** Section-level editorial line — serif, one step above `section`. */
  editorialLg: {
    fontFamily: f.serif,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '600' as '600',
    letterSpacing: -0.5,
  },
  /** Oversized quiet numeral for stats, timers, scores. */
  numeral: {
    fontFamily: f.serif,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '500' as '600',
    letterSpacing: -0.5,
  },
  /** Small-caps style eyebrow: uppercase, wide tracking, for kickers only. */
  kicker: {
    fontFamily: f.semibold,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600' as '600',
    letterSpacing: 1.4,
  },
  editorial: {
    fontFamily: f.serif,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600' as '600',
    letterSpacing: -0.45,
  },
  section: {
    fontFamily: f.semibold,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as '600',
    letterSpacing: -0.3,
  },
  cardTitle: {
    fontFamily: f.semibold,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as '600',
    letterSpacing: -0.2,
  },
  take: {
    fontFamily: f.medium,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500' as '600',
    letterSpacing: -0.15,
  },
  takeText: {
    fontFamily: f.semibold,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600' as '600',
    letterSpacing: -0.3,
  },
  body: {
    fontFamily: f.regular,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as '600',
    letterSpacing: -0.1,
  },
  bodyStrong: {
    fontFamily: f.medium,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500' as '600',
    letterSpacing: -0.1,
  },
  label: {
    fontFamily: f.medium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500' as '600',
    letterSpacing: -0.05,
  },
  meta: {
    fontFamily: f.regular,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as '600',
    letterSpacing: 0,
  },
  data: {
    fontFamily: f.mono,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as '600',
    letterSpacing: 0.2,
  },
  dataLg: {
    fontFamily: f.mono,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as '600',
    letterSpacing: -0.2,
  },
  caption: {
    fontFamily: f.medium,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500' as '600',
    letterSpacing: 0.2,
  },
  eyebrow: {
    fontFamily: f.medium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as '600',
    letterSpacing: 0.2,
  },
  button: {
    fontFamily: f.semibold,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600' as '600',
    letterSpacing: -0.1,
  },
  /** Sidebar / nav primary labels — ChatGPT-like density. */
  nav: {
    fontFamily: f.medium,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '500' as '600',
    letterSpacing: -0.2,
  },

  } as const satisfies Record<string, TextStyle>;
}

/**
 * The ramp actually used by the app.
 *
 * `typography.ts` calls `buildTypeScale()` with `Platform.select` stacks and
 * re-exports the result as `typeScale`; this default instance keeps every
 * dependency-free consumer (unit tests, the render probe) working without a
 * React Native runtime. Do **not** import `typeScale` from here in app code —
 * import it from `../theme` so the platform-resolved version is used.
 */
export const typeScale = buildTypeScale({
  regular: family.regular,
  medium: family.medium,
  semibold: family.semibold,
  bold: family.bold,
  mono: family.mono,
  serif: family.serif,
});

export type TypeToken = keyof typeof typeScale;

/**
 * Resolve the platform font stacks from an OS name.
 *
 * Pure on purpose. `Platform.select` is just a lookup keyed by the running OS,
 * so modelling it as a function of that key lets the *real* resolution be
 * tested: `resolveFontStacks('ios').serif === 'New York'`. The Phase 1 test
 * compared `typeScale.display.fontFamily` against `family.serif` where both were
 * the same frozen generic string — it asserted self-consistency and stayed green
 * while iOS silently rendered San Francisco.
 */
export function resolveFontStacks(os: 'ios' | 'android' | 'web' | 'windows' | 'macos'): FontStacks {
  switch (os) {
    case 'ios':
      return { serif: 'New York', mono: 'Menlo', systemSans: 'System' };
    case 'android':
      return { serif: 'serif', mono: 'monospace', systemSans: 'sans-serif' };
    case 'web':
      return { serif: 'Georgia', mono: 'monospace', systemSans: 'System' };
    case 'windows':
    case 'macos':
    default:
      return { serif: 'Georgia', mono: 'monospace', systemSans: 'System' };
  }
}
