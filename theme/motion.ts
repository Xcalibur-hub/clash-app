import { Easing } from 'react-native-reanimated';

/** Motion tokens. Realm Shift targets 500–800ms (spec §16). */
export const duration = {
  instant: 120,
  fast: 200,
  base: 320,
  slow: 520,
  cinematic: 760,
  /** "Your judgement has been recorded." hold before the jury reveal. */
  reveal: 1250,
} as const;

export const ease = {
  out: Easing.bezier(0.22, 1, 0.36, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  /** Overshoot for buttons and cards that should feel physical. */
  overshoot: Easing.bezier(0.34, 1.42, 0.64, 1),
} as const;

export const spring = {
  press: { damping: 18, stiffness: 320, mass: 0.6 },
  settle: { damping: 22, stiffness: 180, mass: 0.8 },
} as const;

export const scale = {
  press: 0.968,
} as const;
