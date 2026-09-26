import {
  fetchCommentsForTakes,
  fetchProfiles,
  fetchTakes,
  fetchViewerProfile,
  fetchViewerUpvoteIds,
} from './apiService';
import { isSupabaseConfigured } from './supabaseClient';
import type { ArenaSnapshot } from '../store/reducer';

/**
 * Assembles one live Arena snapshot: active takes, their rebuttals, the people
 * behind them, the viewer's own profile and vote state. Reads fan out once takes
 * are known; the vote lookup follows the viewer because upvote rows are keyed by
 * the resolved profile id, not the seeded one.
 *
 * Returns null when the backend is unconfigured or unreachable — the provider
 * then keeps the bundled seed snapshot and the app stays fully usable offline.
 */
export async function loadArena(): Promise<ArenaSnapshot | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const takes = await fetchTakes();
    const [comments, users, viewer] = await Promise.all([
      fetchCommentsForTakes(takes.map((take) => take.id)),
      fetchProfiles(),
      fetchViewerProfile(),
    ]);
    // Votes are keyed by profile id, so this runs after the viewer resolves —
    // the seeded-viewer default would query the wrong row for a linked account.
    const upvotedCommentIds = await fetchViewerUpvoteIds(viewer?.id);
    return { takes, comments, users, viewer, upvotedCommentIds };
  } catch {
    return null;
  }
}
