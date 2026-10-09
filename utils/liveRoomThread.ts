import { compareOfficial } from './officialRecovery.ts';
/**
 * Live-room thread helpers: reply fan-out, ranking, deleted-parent soft-fail.
 * Ordering of roots remains server createdAt + id (newest-first).
 */

export interface ThreadMessageLike {
  id: string;
  parentMessageId: string | null;
  kind: string;
  createdAt: number;
  preciseCreatedAt?: string;
  pending?: boolean;
  reactions: readonly { count: number }[];
  /** Server reply count when available; otherwise derived from loaded children. */
  replyCount?: number;
}

export function reactionTotal(message: ThreadMessageLike): number {
  return message.reactions.reduce((sum, r) => sum + r.count, 0);
}

/** Rank replies: strongest signal first, then newest, then stable id. */
export function rankReplies<T extends ThreadMessageLike>(replies: readonly T[]): T[] {
  return [...replies].sort((a, b) => {
    const scoreDiff = reactionTotal(b) - reactionTotal(a);
    if (scoreDiff !== 0) return scoreDiff;
    if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
    return b.id.localeCompare(a.id);
  });
}

export function childrenOf<T extends ThreadMessageLike>(
  messages: readonly T[],
  parentId: string,
): T[] {
  return messages.filter((m) => m.parentMessageId === parentId && m.kind !== 'system');
}

/**
 * Roots for the live FlatList (newest-first already).
 * Orphan replies (parent missing from the loaded set) stay as top-level rows
 * so the UI can show “[argument unavailable]”.
 */
export function selectThreadRoots<T extends ThreadMessageLike>(
  messages: readonly T[],
): T[] {
  const ids = new Set(messages.map((m) => m.id));
  return messages.filter((m) => {
    if (m.kind === 'system') return true;
    if (!m.parentMessageId) return true;
    // Parent not loaded / hidden → keep as orphan row.
    return !ids.has(m.parentMessageId);
  });
}

export function replyPreview<T extends ThreadMessageLike>(
  messages: readonly T[],
  parentId: string,
  limit: number,
  expanded: boolean,
): { shown: T[]; hiddenCount: number; total: number } {
  const all = rankReplies(childrenOf(messages, parentId));
  const serverCount = messages.find((m) => m.id === parentId)?.replyCount;
  const total = Math.max(all.length, serverCount ?? 0);
  if (expanded || limit <= 0) {
    return { shown: all, hiddenCount: Math.max(0, total - all.length), total };
  }
  const shown = all.slice(0, limit);
  return {
    shown,
    hiddenCount: Math.max(0, total - shown.length),
    total,
  };
}

/** Newest-first merge with id dedupe — server row wins over pending. */
export function mergeMessagesById<T extends ThreadMessageLike & { pending?: boolean }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const byId = new Map<string, T>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) {
    const existing = byId.get(message.id);
    byId.set(
      message.id,
      existing?.pending ? message : ({ ...existing, ...message } as T),
    );
  }
  return [...byId.values()].sort((a, b) =>
    compareOfficial(b,a),
  );
}

/**
 * Apply a bounded server visibility check without disturbing messages that were
 * outside the checked window. Pending optimistic rows are never removed here.
 */
export function removeUnavailableMessages<T extends ThreadMessageLike>(
  current: readonly T[],
  checkedIds: readonly string[],
  visibleIds: readonly string[],
): T[] {
  const checked = new Set(checkedIds);
  const visible = new Set(visibleIds);
  return current.filter(
    (message) => message.pending || !checked.has(message.id) || visible.has(message.id),
  );
}
