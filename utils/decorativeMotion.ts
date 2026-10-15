/**
 * Central dev-only switch for continuous decorative motion.
 *
 * The Live Room's ambient loops (breathing dot, drifting atmosphere, pulse-sheet
 * nodes) keep the window perpetually "busy", which makes Android accessibility
 * inspection (`uiautomator dump`) time out with `could not get idle state`.
 * Test runs need a room that can settle without losing any function.
 *
 * Rules:
 *  - Default OFF.
 *  - Only a development build can freeze motion.
 *  - A production build never freezes, even if the variable is set.
 *  - Only decorative loops are affected; arguments, assists, buttons,
 *    navigation, polling, sockets and one-shot feedback are untouched.
 *
 * Pure and React Native-free so the rule is unit-testable.
 */

export const DECORATIVE_MOTION_ENV = 'EXPO_PUBLIC_ARENA_DISABLE_DECORATIVE_MOTION';

export interface DecorativeMotionInput {
  /** The bundler's `__DEV__`. */
  isDev: boolean;
  /** Raw `EXPO_PUBLIC_ARENA_DISABLE_DECORATIVE_MOTION` value, when present. */
  flag: string | null | undefined;
}

/** True only when a development build explicitly opts in with `=1`. */
export function decorativeMotionFrozen({ isDev, flag }: DecorativeMotionInput): boolean {
  if (isDev !== true) return false;
  return flag === '1';
}

/**
 * Build-time result for components. `__DEV__` and `EXPO_PUBLIC_*` are inlined by
 * the bundler, so this is a constant — and `false` in production by construction.
 */
export const DECORATIVE_MOTION_FROZEN: boolean = decorativeMotionFrozen({
  isDev: typeof __DEV__ !== 'undefined' && __DEV__ === true,
  flag: typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_ARENA_DISABLE_DECORATIVE_MOTION ?? null
    : null,
});
