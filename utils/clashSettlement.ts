export interface ServerVerdict {
  clashId: string;
  winnerSide: 'A' | 'B' | 'DRAW';
  sideAScore: number;
  sideBScore: number;
  jurySize: number;
  agreement: number;
  margin: number;
  verdictLabel: string;
}

/** Settled results retain the legacy flat verdict fields for existing consumers. */
export type ClashSettlementResult =
  | (ServerVerdict & { status: 'settled'; verdict: ServerVerdict })
  | { status: 'cancelled'; clashId: string; jurySize: 0; verdict: null };

export function parseClashSettlement(payload: unknown, expectedClashId: string): ClashSettlementResult | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const r = payload as Record<string, unknown>;
  if (r.clash_id !== expectedClashId || !expectedClashId) return null;
  if (r.status === 'cancelled') {
    if (r.jury_size !== 0 || (r.verdict !== undefined && r.verdict !== null)
      || ['winner_side','side_a_score','side_b_score','agreement','margin','verdict_label'].some(key => r[key] !== undefined)) return null;
    return { status: 'cancelled', clashId: expectedClashId, jurySize: 0, verdict: null };
  }
  if (r.status !== undefined && r.status !== 'settled') return null;
  if (r.winner_side !== 'A' && r.winner_side !== 'B' && r.winner_side !== 'DRAW') return null;
  if (![r.side_a_score,r.side_b_score,r.jury_size,r.margin].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)
    || typeof r.agreement !== 'number' || !Number.isFinite(r.agreement) || r.agreement < 0 || r.agreement > 1
    || typeof r.verdict_label !== 'string' || !r.verdict_label.trim()) return null;
  const a=r.side_a_score as number, b=r.side_b_score as number, jury=r.jury_size as number;
  if (jury < 1 || a+b !== jury || r.margin !== Math.abs(a-b)
    || r.winner_side !== (a===b ? 'DRAW' : a>b ? 'A' : 'B')) return null;
  const verdict: ServerVerdict = { clashId: expectedClashId, winnerSide: r.winner_side,
    sideAScore: a, sideBScore: b, jurySize: jury, agreement: r.agreement, margin: r.margin as number, verdictLabel: r.verdict_label };
  return { ...verdict, status: 'settled', verdict };
}
