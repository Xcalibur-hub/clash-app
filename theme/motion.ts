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
