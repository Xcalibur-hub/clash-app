import { Platform } from 'react-native';
import { buildTypeScale, family as pureFamily, resolveFontStacks } from './typeRamp';

/**
 * Typography entry point — the only place the platform is known.
 *
 * `typeRamp.ts` stays free of React Native so the ramp can be unit-tested under
 * Node. That means the platform-specific font *stacks* have to be resolved here
 * and then handed back into the ramp builder, because every ramp step embeds a
 * `fontFamily`.
 *
 * Phase 1 got this order wrong: it exported the ready-made ramp, and only then
 * overrode `family.serif` with `Platform.select`. The override arrived after the
 * ramp had been frozen, so all 291 `typeScale` consumers kept the generic
 * `'serif'` string — an invalid font name on iOS, which silently falls back to
 * San Francisco and erases the editorial voice. See
 * `docs/aura/PHASE2-AUDIT.md` blocker 7.
 *
 * The fix is structural rather than a patch: the ramp is now *built from* the
 * resolved stacks, so a late override is not expressible.
 */

/**
 * Editorial serif — the AURA display voice.
 *
 * Deliberately the *platform* serif rather than a bundled webfont: no extra
 * download, no font-swap flash, and each OS renders its own optical-size cut
 * (iOS New York, Android Noto Serif). This is what gives headlines, Vault
 * creator identity and verdict moments a voice that Inter alone cannot carry.
 *
 * `Platform.OS` is resolved through the same pure function the tests exercise,
 * so what ships is what was tested.
 */
const stacks = resolveFontStacks(Platform.OS as 'ios' | 'android' | 'web' | 'windows' | 'macos');

/** Active font map — Inter for UI text, the platform serif for display. */
export const family = {
  ...pureFamily,
  serif: stacks.serif,
  mono: stacks.mono,
  systemSans: stacks.systemSans,
} as const;

/**
 * The resolved ramp. Built *after* the platform stacks, so `fontFamily` on every
 * step points at a font that exists on this OS.
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
