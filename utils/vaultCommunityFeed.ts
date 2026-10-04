/**
 * Community feed composition + labels (Phase 15.2). Pure and dependency-free so
 * the ordering rules (created_at desc, id desc tie-break) stay testable.
 */

export type CommunityFeedType = 'discussion' | 'announcement';

export interface CommunityFeedRow {
  id: string;
  createdAt: number;
  type: CommunityFeedType;
}

/**
 * Stable newest-first ordering with a deterministic `id` tie-break. Two rows
 * created in the same millisecond must never swap between renders.
 */
export function sortCommunityFeedDesc<T extends { id: string; createdAt: number }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    if (a.id === b.id) return 0;
    return a.id < b.id ? 1 : -1;
  });
}

/**
 * Splits the feed into the pinned announcement (most recent only) and the
 * ordered discussion list. Announcements are never mixed into discussions.
 */
export function splitCommunityFeed<T extends CommunityFeedRow>(
  rows: readonly T[],
): { announcement: T | null; discussions: T[] } {
  const ordered = sortCommunityFeedDesc(rows);
  const announcement = ordered.find((row) => row.type === 'announcement') ?? null;
  const discussions = ordered.filter((row) => row.type === 'discussion');
  return { announcement, discussions };
}

function compact(value: number): string {
  if (value < 1000) return String(value);
  const k = value / 1000;
  return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}k`;
}

/** "124 members" / "1 member". */
export function communityMemberLabel(count: number): string {
  const safe = Math.max(0, Math.floor(count));
  return `${compact(safe)} ${safe === 1 ? 'member' : 'members'}`;
}

/** "12 active today" — omitted copy handled by the caller when count is 0. */
export function communityActiveLabel(count: number): string {
  const safe = Math.max(0, Math.floor(count));
  return `${compact(safe)} active today`;
}

/** The single-line summary used on the Vault chapter card. */
export function communityMemberSummary(members: number, active: number): string {
  return `${communityMemberLabel(members)} · ${communityActiveLabel(active)}`;
}

/** "3 replies" / "View replies" — the small interaction row label. */
export function communityReplyCountLabel(count: number): string {
  const safe = Math.max(0, Math.floor(count));
  if (safe === 0) return 'Reply';
  return `${compact(safe)} ${safe === 1 ? 'reply' : 'replies'}`;
}
