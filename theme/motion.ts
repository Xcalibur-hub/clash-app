import { Easing } from 'react-native-reanimated';

/** Motion tokens — quick, subtle, native-feeling (120–220ms microinteractions). */
export const duration = {
  instant: 100,
  fast: 160,
  base: 200,
  slow: 280,
  cinematic: 400,
  reveal: 500,
} as const;

export const ease = {
  out: Easing.bezier(0.22, 1, 0.36, 1),
  inOut: Easing.bezier(0.4, 0, 0.2, 1),
  /** Gentle overshoot for physical-feeling controls. */
  overshoot: Easing.bezier(0.3, 1.2, 0.5, 1),
} as const;

export const spring = {
  press: { damping: 18, stiffness: 320, mass: 0.6 },
  settle: { damping: 22, stiffness: 200, mass: 0.9 },
} as const;

export const scale = {
  press: 0.985,
} as const;

/**
 * AURA motion grammar.
 *
 * One rule: motion communicates *state change*, never decoration. Distances are
 * small (6–14dp) so an entrance reads as "settled into place" rather than a
 * performance, and every value here is gated by `useReducedMotion()` at the
 * component that consumes it.
 */
export const presence = {
  /** New content arriving into a list. */
  enter: { from: { opacity: 0, translateY: 8 }, duration: 240 },
  /** Content leaving — faster than entering, so removal feels decisive. */
  exit: { to: { opacity: 0, translateY: -4 }, duration: 160 },
  /** Sheets and docks. */
  overlay: { from: { opacity: 0, translateY: 14 }, duration: 280 },
  /** Press feedback scale on large surfaces. */
  pressLarge: 0.99,
  /** Stagger between siblings in a stack (ms). */
  stagger: 40,
  /** Maximum siblings that may stagger; beyond this they animate together. */
  staggerMax: 4,
} as const;
