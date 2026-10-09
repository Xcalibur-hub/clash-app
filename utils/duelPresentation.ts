import { compareOfficial } from './officialRecovery.ts';
import type { ArenaDuel } from './arenaDuelPayload';
import type { ArenaEvidence, ArenaMessage, ArenaPhase, ArenaRoom } from '../services/liveArenaService';

export function isCanonicalDuel(room: Pick<ArenaRoom, 'roomMode' | 'clashId' | 'duel'>): boolean {
  return room.roomMode === 'DUEL' && Boolean(room.duel && room.clashId === room.duel.clashId);
}
export function duelFighterSide(duel: ArenaDuel, authorId: string | null | undefined): 'A' | 'B' | null {
  return authorId === duel.fighterA.id ? 'A' : authorId === duel.fighterB.id ? 'B' : null;
}
export function duelPresentation(duel: ArenaDuel, phase: ArenaPhase) {
  const side = duel.viewerRelationship === 'fighter_a' ? 'A' : duel.viewerRelationship === 'fighter_b' ? 'B' : null;
  const role = side
    ? `YOU'RE FIGHTING · FIGHTER ${side}`
    : duel.viewerRelationship === 'staff'
      ? 'MODERATOR · WATCHING'
      : duel.status === 'open' && phase === 'judging'
        ? 'JUDGING OPEN'
        : 'WATCHING';
  const stage = duel.status === 'cancelled' ? 'Cancelled' : duel.status === 'settled' ? 'Complete'
    : phase === 'scheduled' ? 'Waiting' : phase === 'closed' ? 'Settlement pending'
    : phase === 'judging' ? 'Judging' : phase === 'final_arguments' ? 'Final arguments' : 'Live';
  const hint = stage === 'Cancelled' ? 'This Clash ended without a verdict.'
    : stage === 'Complete' ? 'The official verdict is available.'
    : stage === 'Waiting' ? 'Waiting for the Clash to begin.'
    : stage === 'Settlement pending' ? 'Voting has closed. The server has not completed settlement. Refresh to check for a verdict or cancellation.'
    : stage === 'Judging' ? 'Who made the stronger case?'
    : stage === 'Final arguments' ? 'The fighters are making their final arguments.'
    : 'Clash in progress.';
  return { side, role, stage, hint,
    canWatch: duel.status === 'settled' || (duel.status === 'open' && phase !== 'closed'),
    canPublish: Boolean(side && duel.status === 'open' && (phase === 'open' || phase === 'final_arguments')),
    canJudge: duel.status === 'open' && phase === 'judging' && duel.mayJudge && !duel.hasJudged && !side,
  };
}
/** Flatten every fighter response into chronology; never hide it in ranked previews.
 * Input contains only rows cleared by the existing server visibility path. */
export function duelTranscript(duel: ArenaDuel, messages: readonly ArenaMessage[]): ArenaMessage[] {
  return messages.filter(message => message.kind === 'system' || duelFighterSide(duel, message.author?.id))
    .slice().sort((a, b) => compareOfficial(a,b));
}
/** A hidden/evicted parent never leaks through an evidence attachment. */
export function duelEvidence(duel: ArenaDuel, evidence: readonly ArenaEvidence[], messages: readonly ArenaMessage[]): ArenaEvidence[] {
  const ids = new Set(messages.map(message => message.id));
  return evidence.filter(item => duelFighterSide(duel, item.author?.id) && (!item.messageId || ids.has(item.messageId)))
    .slice().sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}
export function duelTimestamp(createdAt: number): string | null {
  if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
export function duelResultTitle(duel: ArenaDuel): string | null {
  if (duel.status === 'cancelled') return 'Clash cancelled';
  if (duel.status !== 'settled' || !duel.verdict) return null;
  return duel.verdict.winnerSide === 'DRAW'
    ? 'Draw'
    : `${duel.verdict.winnerSide === 'A' ? duel.fighterA.name : duel.fighterB.name} made the stronger case`;
}
export function duelEmptyText(duel: ArenaDuel, phase: ArenaPhase, kind: 'transcript' | 'evidence'): string {
  if (kind === 'evidence') return 'No visible evidence yet. Evidence shared by the fighters will appear here.';
  if (duel.status !== 'open') return 'No visible arguments in this transcript.';
  if (phase === 'scheduled') return 'The transcript will begin when the Clash opens.';
  return 'THE FLOOR IS OPEN\n\nWaiting for the first argument.';
}

/** Exactly two official active speakers — Side A and Side B. Invited users never become Fighter C. */
export function duelActiveSpeakers(duel: ArenaDuel): readonly [ArenaDuel['fighterA'], ArenaDuel['fighterB']] {
  return [duel.fighterA, duel.fighterB];
}

/** Latest official argument per side for the Stage — not the full history. */
export function duelCurrentArguments(
  duel: ArenaDuel,
  messages: readonly ArenaMessage[],
): { a: ArenaMessage | null; b: ArenaMessage | null } {
  const transcript = duelTranscript(duel, messages);
  let a: ArenaMessage | null = null;
  let b: ArenaMessage | null = null;
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const message = transcript[i]!;
    if (message.kind === 'system') continue;
    const side = duelFighterSide(duel, message.author?.id);
    if (side === 'A' && !a) a = message;
    if (side === 'B' && !b) b = message;
    if (a && b) break;
  }
  return { a, b };
}

/**
 * Newest canonical fighter argument — the Stage "moment".
 * Not typing/turn/timer state (backend does not expose those).
 */
export function duelLatestMoment(
  duel: ArenaDuel,
  messages: readonly ArenaMessage[],
): { side: 'A' | 'B' | null; message: ArenaMessage | null } {
  const transcript = duelTranscript(duel, messages);
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const message = transcript[i]!;
    if (message.kind === 'system') continue;
    const side = duelFighterSide(duel, message.author?.id);
    if (side) return { side, message };
  }
  return { side: null, message: null };
}

/** Collapse long Stage arguments so the live canvas stays intact. */
export const DUEL_STAGE_ARGUMENT_PREVIEW = 220;

export function duelArgumentPreview(
  body: string,
  limit = DUEL_STAGE_ARGUMENT_PREVIEW,
): { preview: string; truncated: boolean } {
  const text = body.trim();
  if (text.length <= limit) return { preview: text, truncated: false };
  const cut = text.slice(0, limit);
  const soft = cut.lastIndexOf(' ');
  const preview = (soft > limit * 0.55 ? cut.slice(0, soft) : cut).trimEnd();
  return { preview: `${preview}…`, truncated: true };
}
