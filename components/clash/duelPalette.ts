import type { Side } from '../../store';
import { duel } from '../../theme';

export interface SideTone {
  /** Primary colour of the side. */
  tone: string;
  /** Low-alpha fill for cards and badges. */
  soft: string;
  /** Hairline and ring colour. */
  line: string;
}

const TONES: Record<Side, SideTone> = {
  A: { tone: duel.a, soft: duel.aSoft, line: duel.aLine },
  B: { tone: duel.b, soft: duel.bSoft, line: duel.bLine },
};

/**
 * Single source of the duel palette — A is violet, B is electric blue. Every Clash
 * surface reads its colours from here so the two sides can never drift apart.
 */
export function sideTone(side: Side): SideTone {
  return TONES[side];
}
