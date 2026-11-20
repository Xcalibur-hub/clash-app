export type ChallengeStatus = 'PENDING' | 'ACCEPTED' | 'PASSED' | 'CANCELLED' | 'EXPIRED';
export interface ArenaChallenge {
  id: string; takeId: string; challengerId: string; challengedId: string;
  counterPosition: string; status: ChallengeStatus;
  createdAt: string; expiresAt: string; resolvedAt: string | null;
  clashId: string | null; roomId: string | null; created: boolean;
  challenger: { id: string; name: string; handle: string };
}
const statuses: readonly string[] = ['PENDING','ACCEPTED','PASSED','CANCELLED','EXPIRED'];
export function parseArenaChallenge(value: unknown): ArenaChallenge {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Challenge');
  const p = value as Record<string, unknown>;
  for (const key of ['id','takeId','challengerId','challengedId','counterPosition','createdAt','expiresAt']) {
    if (typeof p[key] !== 'string' || !(p[key] as string).trim()) throw new Error('Invalid Challenge');
  }
  if (!statuses.includes(p.status as string) || typeof p.created !== 'boolean' || p.challengerId === p.challengedId
    || !Number.isFinite(Date.parse(p.createdAt as string)) || !Number.isFinite(Date.parse(p.expiresAt as string))) {
    throw new Error('Invalid Challenge state');
  }
  for (const key of ['clashId','roomId','resolvedAt']) {
    if (p[key] !== null && (typeof p[key] !== 'string' || !p[key])) throw new Error('Invalid Challenge link');
  }
  const accepted = p.status === 'ACCEPTED';
  if (Date.parse(p.expiresAt as string) <= Date.parse(p.createdAt as string)
    || (p.resolvedAt !== null && !Number.isFinite(Date.parse(p.resolvedAt as string)))
    || (p.status !== 'PENDING' && p.status !== 'EXPIRED' && p.resolvedAt === null)) throw new Error('Invalid Challenge clock');
  if ((!accepted && (p.clashId !== null || p.roomId !== null)) || (p.roomId !== null && p.clashId === null)
    || (p.status === 'PENDING' && p.resolvedAt !== null)) throw new Error('Invalid Challenge outcome');
  const actor = p.challenger as Record<string, unknown> | null;
  if (!actor || actor.id !== p.challengerId || typeof actor.name !== 'string' || typeof actor.handle !== 'string') {
    throw new Error('Invalid challenger');
  }
  return p as unknown as ArenaChallenge;
}
/** Server status stays authoritative; local expiry only removes stale buttons. */
export function challengeCanAct(ch: ArenaChallenge, now = Date.now()): boolean {
  return ch.status === 'PENDING' && Date.parse(ch.expiresAt) > now;
}
export function validCounterPosition(text: string): boolean {
  const length = Array.from(text.trim()).length;
  return length >= 20 && length <= 500 && /[\p{L}\p{N}]/u.test(text);
}
