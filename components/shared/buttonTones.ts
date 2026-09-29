import { accent, action, ink, type GradientColors } from '../../theme';

/**
 * Restrained button finishes. `light` is the primary near-white action; `ink`
 * and `glass` are the dark neutral secondary variants; `a` / `b` / `gold` are
 * the sparingly-used accent fills. No gradients, no glow.
 */
export type ButtonTone = 'a' | 'b' | 'gold' | 'glass' | 'light' | 'ink';

export interface ButtonPalette {
  /** Kept for interface compatibility — always null (no gradient fills). */
  colors: GradientColors | null;
  fill: string;
  text: string;
  icon: string;
  border: string;
  glow: string;
  glowOpacity: number;
}

export const BUTTON_TONES: Record<ButtonTone, ButtonPalette> = {
  light: {
    colors: null,
    fill: action.fill,
    text: action.text,
    icon: action.text,
    border: action.fill,
    glow: '#000000',
    glowOpacity: 0,
  },
  ink: {
    colors: null,
    fill: action.darkFill,
    text: action.darkText,
    icon: action.darkText,
    border: action.darkBorder,
    glow: '#000000',
    glowOpacity: 0,
  },
  glass: {
    colors: null,
    fill: 'rgba(255,255,255,0.05)',
    text: ink.primary,
    icon: ink.primary,
    border: 'rgba(255,255,255,0.10)',
    glow: '#000000',
    glowOpacity: 0,
  },
  a: {
    colors: null,
    fill: accent.a,
    text: '#14121A',
    icon: '#14121A',
    border: accent.a,
    glow: '#000000',
    glowOpacity: 0,
  },
  b: {
    colors: null,
    fill: accent.b,
    text: '#0B1526',
    icon: '#0B1526',
    border: accent.b,
    glow: '#000000',
    glowOpacity: 0,
  },
  gold: {
    colors: null,
    fill: accent.gold,
    text: '#171208',
    icon: '#171208',
    border: accent.gold,
    glow: '#000000',
    glowOpacity: 0,
  },
};
