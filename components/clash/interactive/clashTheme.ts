/**
 * Theme-aware soft fills for duel sides (Light + Dark).
 */
import type { Side } from '../../../store';
import { duel, useThemeColors, type SemanticTheme } from '../../../theme';
import { sideTone, type SideTone } from '../duelPalette';

export function useDuelSurface(side: Side): SideTone & { selectedFill: string; mutedFill: string } {
  const t = useThemeColors();
  const base = sideTone(side);
  const soft =
    t.scheme === 'light'
      ? side === 'A'
        ? 'rgba(165,128,255,0.10)'
        : 'rgba(61,139,255,0.10)'
      : base.soft;
  const selectedFill =
    t.scheme === 'light'
      ? side === 'A'
        ? 'rgba(165,128,255,0.18)'
        : 'rgba(61,139,255,0.18)'
      : side === 'A'
        ? 'rgba(165,128,255,0.22)'
        : 'rgba(61,139,255,0.22)';
  const mutedFill = t.surfaceMuted;
  return { ...base, soft, selectedFill, mutedFill };
}

export function clashChrome(t: SemanticTheme) {
  return {
    bg: t.background,
    card: t.surface,
    cardElevated: t.surfaceElevated,
    text: t.textPrimary,
    textSec: t.textSecondary,
    textMuted: t.textMuted,
    border: t.border,
    borderStrong: t.borderStrong,
    accent: t.accent,
    overlay: t.overlay,
  };
}

export { duel };
