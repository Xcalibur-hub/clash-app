/**
 * Theme-aware soft fills for duel sides (Light + Dark).
 * Editorial, restrained — opinion text dominates; side tint is a quiet cue.
 */
import type { Side } from '../../../store';
import { duel, useThemeColors, type SemanticTheme } from '../../../theme';
import { sideTone, type SideTone } from '../duelPalette';

/** Clash-stage tones — warmer / cooler neutrals, less neon than the raw duel palette. */
const EDITORIAL: Record<Side, { tone: string; softLight: string; softDark: string; selectedLight: string; selectedDark: string }> = {
  A: {
    tone: '#C4A574',
    softLight: 'rgba(196,165,116,0.10)',
    softDark: 'rgba(196,165,116,0.12)',
    selectedLight: 'rgba(196,165,116,0.18)',
    selectedDark: 'rgba(196,165,116,0.20)',
  },
  B: {
    tone: '#7E9AA8',
    softLight: 'rgba(126,154,168,0.10)',
    softDark: 'rgba(126,154,168,0.14)',
    selectedLight: 'rgba(126,154,168,0.18)',
    selectedDark: 'rgba(126,154,168,0.22)',
  },
};

export function useDuelSurface(side: Side): SideTone & { selectedFill: string; mutedFill: string } {
  const t = useThemeColors();
  const editorial = EDITORIAL[side];
  const soft = t.scheme === 'light' ? editorial.softLight : editorial.softDark;
  const selectedFill = t.scheme === 'light' ? editorial.selectedLight : editorial.selectedDark;
  const line = t.scheme === 'light' ? 'rgba(28,25,23,0.10)' : 'rgba(250,250,248,0.12)';
  return {
    tone: editorial.tone,
    soft,
    line,
    selectedFill,
    mutedFill: t.surfaceMuted,
  };
}

/** Fallback raw duel tone (settled bars etc. that still use sideTone). */
export function useLegacyDuelTone(side: Side): SideTone {
  return sideTone(side);
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
