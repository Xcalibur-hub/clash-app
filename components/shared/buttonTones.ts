import { accent, action, gradient, ink, tint, type GradientColors } from '../../theme';

/**
 * Button finishes for CLASH. `light` is the reference design's clean white pill
 * (`#FFFFFF` fill, `#09090C` text) and `ink` its matte-obsidian twin used for the
 * in-card CTA.
 */
export type ButtonTone = 'a' | 'b' | 'gold' | 'glass' | 'light' | 'ink';

export interface ButtonPalette {
  /** Gradient fill. When null the solid `fill` is painted instead. */
  colors: GradientColors | null;
  fill: string;
  text: string;
  icon: string;
  border: string;
  glow: string;
  glowOpacity: number;
}

export const BUTTON_TONES: Record<ButtonTone, ButtonPalette> = {
  a: {
    colors: gradient.sideA,
    fill: 'transparent',
    text: '#12060A',
    icon: '#12060A',
    border: 'rgba(255,255,255,0.18)',
    glow: accent.a,
    glowOpacity: 0.45,
  },
  b: {
    colors: gradient.sideB,
    fill: 'transparent',
    text: '#050A18',
    icon: '#050A18',
    border: 'rgba(255,255,255,0.18)',
    glow: accent.b,
    glowOpacity: 0.45,
  },
  gold: {
    colors: gradient.gold,
    fill: 'transparent',
    text: '#1A1204',
    icon: '#1A1204',
    border: 'rgba(255,255,255,0.18)',
    glow: accent.gold,
    glowOpacity: 0.45,
  },
  glass: {
    colors: null,
    fill: tint.neutralSoft,
    text: ink.primary,
    icon: ink.primary,
    border: 'rgba(255,255,255,0.18)',
    glow: accent.violet,
    glowOpacity: 0.45,
  },
  light: {
    colors: null,
    fill: action.fill,
    text: action.text,
    icon: action.text,
    border: action.fill,
    glow: '#FFFFFF',
    glowOpacity: 0.18,
  },
  ink: {
    colors: null,
    fill: action.darkFill,
    text: action.darkText,
    icon: action.darkText,
    border: action.darkBorder,
    glow: '#000000',
    glowOpacity: 0.55,
  },
};
