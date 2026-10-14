/** Keyset-paged Arena discussion reads. Existing RLS remains authoritative.
 * Roots and direct children are fetched separately so partial trees never
 * silently promote a reply into a top-level argument.
 */
import { requireSupabase, requestError } from './supabaseClient';
import { toComment } from './arenaMappers';
import type { ChallengerComment } from '../store/types';

export type DiscussionSort = 'best' | 'new';
export interface DiscussionCursor {
  id: string;
  createdAt: string;
  upvotes?: number;
}
export interface DiscussionPage {
  items: ChallengerComment[];
  next: DiscussionCursor | null;
}

const PAGE_LIMIT = 20;

export async function fetchDiscussionPage(
  takeId: string,
  sort: DiscussionSort,
  parentId: string | null = null,
  cursor: DiscussionCursor | null = null,
): Promise<DiscussionPage> {
  if (!takeId || (parentId !== null && !parentId)) throw new Error('Invalid discussion target');
  if (sort !== 'best' && sort !== 'new') throw new Error('Invalid discussion sort');
  if (cursor && (!cursor.id || !Number.isFinite(Date.parse(cursor.createdAt)) ||
    (sort === 'best' && (!Number.isSafeInteger(cursor.upvotes) || (cursor.upvotes ?? -1) < 0)))) {
    throw new Error('Invalid discussion cursor');
  }
  let query = requireSupabase().from('comments').select('*')
    .eq('take_id', takeId).eq('is_removed', false);
  query = parentId === null ? query.is('parent_comment_id', null) : query.eq('parent_comment_id', parentId);

  // Timestamp + id is stable under ties. The best sort adds vote count, but
  // vote updates can move rows across page boundaries; refresh for a new snapshot.
  if (sort === 'new') {
    query = query.order('created_at', { ascending: false }).order('id', { ascending: false });
    if (cursor) {
      query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    }
  } else {
    query = query.order('upvotes_count', { ascending: false })
      .order('created_at', { ascending: false }).order('id', { ascending: false });
    if (cursor) {
      query = query.or(`upvotes_count.lt.${cursor.upvotes},and(upvotes_count.eq.${cursor.upvotes},created_at.lt.${cursor.createdAt}),and(upvotes_count.eq.${cursor.upvotes},created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    }
  }
  const { data, error } = await query.limit(PAGE_LIMIT + 1);
  if (error) throw requestError(error);
  const rows = (data ?? []).slice(0, PAGE_LIMIT);
  const last = rows[rows.length - 1];
  return {
    items: rows.map(toComment),
    next: data && data.length > PAGE_LIMIT && last
      ? { id: last.id, createdAt: last.created_at, ...(sort === 'best' ? { upvotes: last.upvotes_count } : {}) }
      : null,
  };
}
