import { Platform, type ViewStyle } from 'react-native';
import { glass as glassTint } from './colors';

export type GlassLevel = 'soft' | 'regular' | 'strong';

/** Blur strength per level, tuned for a dark backdrop. */
export const blurIntensity: Record<GlassLevel, number> = {
  soft: 24,
  regular: 42,
  strong: 64,
};

export const glassFill: Record<GlassLevel, string> = {
  soft: glassTint.fillSoft,
  regular: glassTint.fill,
  strong: glassTint.fillStrong,
};

export const glassBorder: Record<GlassLevel, string> = {
  soft: glassTint.borderFaint,
  regular: glassTint.border,
  strong: glassTint.borderStrong,
};

/**
 * Real blur runs on iOS only. Android uses the layered translucent fallback
 * provided by `GlassCard` instead of `dimezisBlurView`, which is expensive on
 * mid-range devices and would cost frames in the Arena feed.
 */
export const supportsBlur = Platform.OS === 'ios';

/** Base surface recipe: solid neutral fill + hairline border (no blur). */
export function glassSurface(_level: GlassLevel = 'regular', r: number = 16): ViewStyle {
  return {
    borderRadius: r,
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  };
}

/**
 * Neutral elevation — no coloured bloom. Callers still pass a colour for
 * compatibility, but it is ignored: surfaces get a plain dark shadow for depth,
 * never a neon glow.
 */
export function glow(_color: string, blur = 12, offsetY = 3, _opacity = 0.42): ViewStyle {
  return {
    shadowColor: '#000000',
    shadowOpacity: 0.32,
    shadowRadius: blur,
    shadowOffset: { width: 0, height: offsetY },
    elevation: 2,
  };
}
