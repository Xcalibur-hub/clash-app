/** Compact, server-owned duel identity. Never derive fighters from roster order. */
export interface DuelFighter {
  id: string;
  name: string;
  handle: string;
}
export interface ArenaDuel {
  clashId: string;
  status: 'open' | 'settled' | 'cancelled';
  fighterA: DuelFighter;
  fighterB: DuelFighter;
  viewerRelationship: 'fighter_a' | 'fighter_b' | 'spectator' | 'staff';
  mayJudge: boolean;
  hasJudged: boolean;
  verdict: { winnerSide: 'A' | 'B' | 'DRAW'; jurySize: number; verdictLabel: string } | null;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid duel payload');
  return value as Record<string, unknown>;
}
function fighter(value: unknown): DuelFighter {
  const r = record(value);
  if (typeof r.id !== 'string' || !r.id || typeof r.name !== 'string' || typeof r.handle !== 'string') {
    throw new Error('Invalid duel fighter');
  }
  return { id: r.id, name: r.name, handle: r.handle };
}
export function parseArenaDuelRoom(value: unknown): {
  roomMode: 'GROUP' | 'DUEL'; clashId: string | null; duel: ArenaDuel | null;
} {
  const r = record(value);
  if (r.roomMode === undefined || r.roomMode === 'GROUP') {
    if (r.clashId != null || r.duel != null) throw new Error('Unmarked duel room');
    return { roomMode: 'GROUP', clashId: null, duel: null };
  }
  if (r.roomMode !== 'DUEL' || typeof r.clashId !== 'string' || !r.clashId) throw new Error('Invalid room mode');
  const d = record(r.duel);
  const a = fighter(d.fighterA), b = fighter(d.fighterB);
  if (a.id === b.id || d.clashId !== r.clashId || d.roomId !== r.roomId ||
      !['open', 'settled', 'cancelled'].includes(d.status as string) ||
      !['fighter_a', 'fighter_b', 'spectator', 'staff'].includes(d.viewerRelationship as string) ||
      typeof d.mayJudge !== 'boolean' || typeof d.hasJudged !== 'boolean') throw new Error('Invalid canonical duel');
  let verdict: ArenaDuel['verdict'] = null;
  if (d.verdict != null) {
    const v = record(d.verdict);
    if (!['A', 'B', 'DRAW'].includes(v.winnerSide as string) ||
        typeof v.jurySize !== 'number' || !Number.isFinite(v.jurySize) || v.jurySize < 0 ||
        typeof v.verdictLabel !== 'string') throw new Error('Invalid duel verdict');
    verdict = { winnerSide: v.winnerSide as 'A' | 'B' | 'DRAW', jurySize: v.jurySize, verdictLabel: v.verdictLabel };
  }
  if ((d.status === 'settled') !== (verdict !== null) ||
      (d.mayJudge && (d.status !== 'open' || d.hasJudged || ['fighter_a', 'fighter_b'].includes(d.viewerRelationship as string)))) {
    throw new Error('Invalid duel outcome or permission');
  }
  return { roomMode: 'DUEL', clashId: r.clashId, duel: {
    clashId: r.clashId, status: d.status as ArenaDuel['status'], fighterA: a, fighterB: b,
    viewerRelationship: d.viewerRelationship as ArenaDuel['viewerRelationship'],
    mayJudge: d.mayJudge, hasJudged: d.hasJudged, verdict,
  } };
}
