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

/** Base glass recipe: rounded, translucent, hairline-bordered. */
export function glassSurface(level: GlassLevel = 'regular', r: number = 28): ViewStyle {
  return {
    borderRadius: r,
    backgroundColor: glassFill[level],
    borderWidth: 1,
    borderColor: glassBorder[level],
    overflow: 'hidden',
  };
}

/** Coloured bloom used for the Clash CTA, winner cards and the result reveal. */
export function glow(color: string, blur = 22, offsetY = 8, opacity = 0.42): ViewStyle {
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: blur,
    shadowOffset: { width: 0, height: offsetY },
    elevation: 6,
  };
}
