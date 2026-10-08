import { parseArenaChallenge, type ArenaChallenge } from './arenaChallengePayload';

export type InboxDirection = 'INCOMING' | 'OUTGOING';
export interface InboxChallenge extends ArenaChallenge {
  recipient: { id: string; name: string; handle: string };
  source: { id: string; title: string; hood: string };
}
export interface ChallengeInboxPage { viewerId: string; items: InboxChallenge[]; hasMore: boolean; }

export function parseChallengeInbox(value: unknown, direction: InboxDirection): ChallengeInboxPage {
  if (!value || typeof value !== 'object') throw new Error('Invalid inbox');
  const page = value as ChallengeInboxPage;
  if (typeof page.viewerId !== 'string' || !page.viewerId || !Array.isArray(page.items)
    || page.items.length > 50 || typeof page.hasMore !== 'boolean') throw new Error('Invalid inbox page');
  const seen = new Set<string>();
  for (const item of page.items) {
    parseArenaChallenge(item);
    if ((direction === 'INCOMING' ? item.challengedId : item.challengerId) !== page.viewerId
      || seen.has(item.id) || item.recipient?.id !== item.challengedId || item.source?.id !== item.takeId
      || typeof item.recipient.name !== 'string' || typeof item.recipient.handle !== 'string'
      || typeof item.source.title !== 'string' || typeof item.source.hood !== 'string') throw new Error('Invalid inbox ownership or source');
    seen.add(item.id);
  }
  return page;
}

export function challengeDestination(ch: ArenaChallenge): string {
  return ch.status === 'ACCEPTED' && ch.clashId && ch.roomId ? `/arena/room/${ch.roomId}` : `/take/${ch.takeId}`;
}
export function challengeStatusLabel(status: ArenaChallenge['status']): string {
  return status === 'PASSED' ? 'Declined' : status.charAt(0) + status.slice(1).toLowerCase();
}
export function challengeInboxError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'account_changed') return 'Your account changed. Reopen the inbox.';
  if (code === '42501') return 'This invitation is no longer available to your account.';
  if (code === 'P0002') return 'This invitation is no longer available.';
  if (code === 'P0003' || code === 'P0006') return 'This invitation changed or expired. Refresh to see its current status.';
  return 'Could not reach the server. Check your connection and try again.';
}
