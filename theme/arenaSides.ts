/**
 * Side A / Side B visual identity for Arena.
 * Agree = Side A, Disagree = Side B — restrained broadcast tones, not neon.
 */
import type { ColorScheme, SemanticTheme } from './palettes';

export type ArenaSideKey = 'A' | 'B';

export interface ArenaSideTone {
  key: ArenaSideKey;
  /** Short broadcast label. */
  label: string;
  /** Stance word (Agree / Disagree). */
  stanceLabel: string;
  ink: string;
  soft: string;
  deep: string;
}

const LIGHT_A: ArenaSideTone = {
  key: 'A',
  label: 'SIDE A',
  stanceLabel: 'Agree',
  ink: '#B4552F',
  soft: 'rgba(180,85,47,0.12)',
  deep: 'rgba(180,85,47,0.20)',
};

const LIGHT_B: ArenaSideTone = {
  key: 'B',
  label: 'SIDE B',
  stanceLabel: 'Disagree',
  ink: '#2C5A86',
  soft: 'rgba(44,90,134,0.12)',
  deep: 'rgba(44,90,134,0.20)',
};

const DARK_A: ArenaSideTone = {
  ...LIGHT_A,
  ink: '#E0885E',
  soft: 'rgba(224,136,94,0.14)',
  deep: 'rgba(224,136,94,0.22)',
};

const DARK_B: ArenaSideTone = {
  ...LIGHT_B,
  ink: '#7FA6CE',
  soft: 'rgba(127,166,206,0.14)',
  deep: 'rgba(127,166,206,0.22)',
};

export function arenaSideTone(side: ArenaSideKey, scheme: ColorScheme): ArenaSideTone {
  if (scheme === 'dark') return side === 'A' ? DARK_A : DARK_B;
  return side === 'A' ? LIGHT_A : LIGHT_B;
}

export function arenaSidesForTheme(t: SemanticTheme): { a: ArenaSideTone; b: ArenaSideTone } {
  return {
    a: arenaSideTone('A', t.scheme),
    b: arenaSideTone('B', t.scheme),
  };
}
