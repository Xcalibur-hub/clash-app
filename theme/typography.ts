import { Platform } from 'react-native';
import { family as pureFamily, typeScale } from './typeRamp';

/**
 * Typography entry point.
 *
 * The ramp itself lives in `typeRamp.ts` (dependency-free, so it can be unit
 * tested). This module only resolves the platform-specific font stacks that
 * need `Platform.select`, and re-exports the ramp so every existing
 * `import { typeScale } from '../theme'` keeps working unchanged.
 */

const serifStack = Platform.select({
  ios: 'New York',
  android: 'serif',
  default: 'Georgia',
}) as string;

const monoStack = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
}) as string;

const systemSans = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
}) as string;

/**
 * Active font map. Display/editorial steps use the platform serif — no extra
 * download and each OS renders its own optical-size cut (iOS New York, Android
 * Noto Serif), which is what gives headlines and verdict moments a voice that
 * Inter alone cannot carry.
 */
export const family = {
  ...pureFamily,
  serif: serifStack,
  mono: monoStack,
  systemSans,
} as const;

export { typeScale };
export type TypeToken = keyof typeof typeScale;
