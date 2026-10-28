/**
 * Canonical verdict presentation. Every field is derived from the authoritative
 * duel payload; nothing is inferred from percentages and nothing is invented
 * when a field is absent.
 */
import type { ArenaDuel } from './arenaDuelPayload';
import { communityVerdictCopy } from './communityVerdict.ts';
import { duelResultTitle } from './duelPresentation.ts';

export type VerdictKind = 'settled' | 'cancelled' | 'pending';

export interface VerdictView {
  kind: VerdictKind;
  title: string | null;
  /** Authoritative winner side, or null when there is no verdict. */
  winnerSide: 'A' | 'B' | 'DRAW' | null;
  /** e.g. "SIDE A · Kevin" or "DRAW". Null when no verdict exists. */
  winnerLabel: string | null;
  /** Explanatory line for cancelled or pending states. */
  support: string | null;
  /** Neutral jury size and A/B totals from the canonical payload. */
  juryLabel: string | null;
  /** Share of the panel, only when both authoritative scores exist. */
  aPct: number | null;
  bPct: number | null;
  aPosition: string;
  bPosition: string;
}

function share(score: number | undefined, jurySize: number): number | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (!Number.isFinite(jurySize) || jurySize <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((score / jurySize) * 100)));
}

export function verdictView(duel: ArenaDuel): VerdictView {
  const aPosition = duel.sourceText?.trim() ?? '';
  const bPosition = duel.counterPosition?.trim() ?? '';
  const base = { aPosition, bPosition };

  if (duel.status === 'cancelled') {
    return {
      ...base,
      kind: 'cancelled',
      title: 'Clash cancelled',
      winnerSide: null,
      winnerLabel: null,
      support: 'No verdict was issued. The room is closed.',
      juryLabel: null,
      aPct: null,
      bPct: null,
    };
  }

  const verdict = duel.verdict;
  if (duel.status !== 'settled' || !verdict) {
    return {
      ...base,
      kind: 'pending',
      title: null,
      winnerSide: null,
      winnerLabel: null,
      support: duel.status === 'settled' ? 'Official result unavailable. Only authorized results can be shown.' : 'Settlement is pending. Refresh to check for the official verdict.',
      juryLabel: null,
      aPct: null,
      bPct: null,
    };
  }

  const winnerLabel =
    verdict.winnerSide === 'DRAW'
      ? 'DRAW'
      : verdict.winnerSide === 'A'
        ? `SIDE A · ${duel.fighterA.name}`
        : `SIDE B · ${duel.fighterB.name}`;
  const juryLabel = communityVerdictCopy(verdict);
  const split = typeof verdict.sideAScore === 'number' && typeof verdict.sideBScore === 'number';

  return {
    ...base,
    kind: 'settled',
    title: duelResultTitle(duel),
    winnerSide: verdict.winnerSide,
    winnerLabel,
    support: null,
    juryLabel,
    aPct: split ? share(verdict.sideAScore, verdict.jurySize) : null,
    bPct: split ? share(verdict.sideBScore, verdict.jurySize) : null,
  };
}
