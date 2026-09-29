/**
 * Assembles one live Arena snapshot from Supabase.
 *
 * Never swallows failures into an ambiguous null that would leave mock seed
 * content looking "live". Callers get a typed success or failure.
 */

import {
  fetchCommentsForTakes,
  fetchMyTakeReactionIds,
  fetchProfiles,
  fetchTakes,
  fetchViewerProfile,
  fetchViewerUpvoteIds,
} from './apiService';
import { fetchViewerSafetyState } from './safetyService';
import { isSupabaseConfigured } from './supabaseClient';
import { logger } from './logger';
import type { ArenaSnapshot } from '../store/reducer';

export type ArenaHydrationFailureReason = 'not_configured' | 'backend';

export type ArenaHydrationResult =
  | { ok: true; snapshot: ArenaSnapshot }
  | {
      ok: false;
      reason: ArenaHydrationFailureReason;
      /** Calm, user-facing copy — never a raw PostgREST message. */
      message: string;
    };

const ARENA_LOAD_ERROR = "Couldn't load Arena.";

/**
 * Load the live Arena. Empty `takes` with `ok: true` means a real empty feed,
 * not a failure. Failures never return mock fixtures.
 */
export async function loadArena(): Promise<ArenaHydrationResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, reason: 'not_configured', message: ARENA_LOAD_ERROR };
  }

  try {
    const viewer = await fetchViewerProfile();
    const safety = await fetchViewerSafetyState(viewer?.id ?? null);
    const hidden = new Set<string>([
      ...safety.blockedProfileIds,
      ...safety.blockingProfileIds,
      ...safety.mutedProfileIds,
    ]);

    const takes = await fetchTakes('for-you', [...hidden]);
    const [comments, users] = await Promise.all([
      fetchCommentsForTakes(takes.map((take) => take.id)),
      fetchProfiles(),
    ]);
    const visibleComments = comments.filter((comment) => !hidden.has(comment.authorId));

    const upvotedCommentIds = await fetchViewerUpvoteIds(viewer?.id);
    const reactedTakeIds = await fetchMyTakeReactionIds(viewer?.id);

    return {
      ok: true,
      snapshot: {
        takes,
        comments: visibleComments,
        users,
        viewer,
        upvotedCommentIds,
        reactedTakeIds,
      },
    };
  } catch (error) {
    logger.captureException(error, { source: 'loadArena' });
    return { ok: false, reason: 'backend', message: ARENA_LOAD_ERROR };
  }
}
