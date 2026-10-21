/**
 * Authoritative verdict sheet structure (UI Phase 5).
 * Separates announcement, explanation, and next-clash affordance.
 * Never invents scores or treats SUPPORT as a judgement.
 */
import type { VerdictView } from './verdictView.ts';

export type VerdictEyebrow = 'VERDICT' | 'OUTCOME' | 'CANCELLED' | 'PENDING';

export function verdictEyebrow(view: VerdictView, duelStatus: string): VerdictEyebrow {
  if (duelStatus === 'cancelled' || view.kind === 'cancelled') return 'CANCELLED';
  if (view.kind === 'pending') return 'PENDING';
  if (view.kind === 'settled') return 'VERDICT';
  return 'OUTCOME';
}

export interface VerdictSheetSections {
  /** Winner / draw / cancelled headline block. */
  announcement: boolean;
  /** Official winner chip — never used for SUPPORT. */
  winner: boolean;
  /** Jury size / verdict label, or pending/cancelled support copy. */
  explanation: string | null;
  /** Panel share rows — only when both canonical scores exist. */
  scores: boolean;
}

export function verdictSheetSections(view: VerdictView): VerdictSheetSections {
  const explanation =
    view.kind === 'settled'
      ? view.juryLabel
      : view.support;

  return {
    announcement: Boolean(view.title),
    winner: Boolean(view.winnerLabel),
    explanation: explanation && explanation.trim() ? explanation.trim() : null,
    scores: view.aPct !== null || view.bPct !== null,
  };
}

/** Explicit guard: SUPPORT / reactions are never official judgements. */
export const VERDICT_IS_NOT_SUPPORT =
  'Official judgements decide the verdict. SUPPORT and reactions do not count as ballots.';
