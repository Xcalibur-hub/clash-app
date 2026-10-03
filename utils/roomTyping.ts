/**
 * Ephemeral typing presence helpers — no draft text, no Postgres writes.
 */

export interface TypingPeer {
  userId: string;
  handle: string;
  name: string;
  replyingToMessageId: string | null;
}

export const TYPING_IDLE_MS = 4_000;
export const TYPING_BROADCAST_MIN_MS = 2_000;

/** Aggregate typers targeting the viewer's own message ids. */
export function typersReplyingToViewer(
  peers: readonly TypingPeer[],
  viewerMessageIds: ReadonlySet<string>,
  viewerId: string,
): TypingPeer[] {
  return peers.filter(
    (p) =>
      p.userId !== viewerId &&
      p.replyingToMessageId != null &&
      viewerMessageIds.has(p.replyingToMessageId),
  );
}

/** Polite, non-noisy copy for targeted reply typing. */
export function formatReplyTypingLabel(peers: readonly TypingPeer[]): string | null {
  const n = peers.length;
  if (n <= 0) return null;
  if (n === 1) {
    const who = peers[0]?.name?.trim() || peers[0]?.handle || 'Someone';
    return `${who} is replying to you…`;
  }
  if (n === 2) {
    const a = peers[0]?.name?.trim() || peers[0]?.handle || 'Someone';
    const b = peers[1]?.name?.trim() || peers[1]?.handle || 'Someone';
    return `${a} and ${b} are replying…`;
  }
  if (n <= 5) return `${n} people are replying…`;
  return 'Lots of people are responding…';
}

/** Subtle live-edge cue when anyone is typing (not targeted). */
export function formatGenericTypingLabel(
  peers: readonly TypingPeer[],
  viewerId: string,
): string | null {
  const others = peers.filter((p) => p.userId !== viewerId);
  if (others.length === 0) return null;
  return 'People are typing…';
}

/**
 * Decide whether a keystroke should broadcast a typing refresh.
 * Returns true on first meaningful input or after the min interval.
 */
export function shouldRefreshTypingBroadcast(
  lastBroadcastAt: number | null,
  now: number,
  hasMeaningfulInput: boolean,
): boolean {
  if (!hasMeaningfulInput) return false;
  if (lastBroadcastAt == null) return true;
  return now - lastBroadcastAt >= TYPING_BROADCAST_MIN_MS;
}

export function typingExpired(lastActiveAt: number, now: number): boolean {
  return now - lastActiveAt >= TYPING_IDLE_MS;
}
