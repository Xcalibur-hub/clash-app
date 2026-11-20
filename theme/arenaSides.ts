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
  ink: '#3D7EB8',
  soft: 'rgba(61,126,184,0.12)',
  deep: 'rgba(61,126,184,0.20)',
};

const LIGHT_B: ArenaSideTone = {
  key: 'B',
  label: 'SIDE B',
  stanceLabel: 'Disagree',
  ink: '#C45B7A',
  soft: 'rgba(196,91,122,0.12)',
  deep: 'rgba(196,91,122,0.20)',
};

const DARK_A: ArenaSideTone = {
  ...LIGHT_A,
  ink: '#6BA3D4',
  soft: 'rgba(107,163,212,0.14)',
  deep: 'rgba(107,163,212,0.22)',
};

const DARK_B: ArenaSideTone = {
  ...LIGHT_B,
  ink: '#D47A94',
  soft: 'rgba(212,122,148,0.14)',
  deep: 'rgba(212,122,148,0.22)',
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
