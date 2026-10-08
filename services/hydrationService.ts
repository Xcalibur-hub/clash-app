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
import {
  ARENA_HYDRATION_TIMEOUT_MS,
  arenaHydrationTimeoutMessage,
} from '../utils/arenaFeedSurface';

export type ArenaHydrationFailureReason = 'not_configured' | 'backend' | 'timeout';

export type ArenaHydrationResult =
  | { ok: true; snapshot: ArenaSnapshot }
  | {
      ok: false;
      reason: ArenaHydrationFailureReason;
      /** Calm, user-facing copy — never a raw PostgREST message. */
      message: string;
    };

const ARENA_LOAD_ERROR = "Couldn't load Arena.";

async function loadArenaSnapshot(): Promise<ArenaSnapshot> {
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
    takes,
    comments: visibleComments,
    users,
    viewer,
    upvotedCommentIds,
    reactedTakeIds,
  };
}

/**
 * Load the live Arena. Empty `takes` with `ok: true` means a real empty feed,
 * not a failure. Failures never return mock fixtures.
 *
 * Bounded wait: a hung local stack (unreachable 127.0.0.1 via adb reverse) must
 * surface Retry instead of spinning the For You skeleton forever.
 */
export async function loadArena(): Promise<ArenaHydrationResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, reason: 'not_configured', message: ARENA_LOAD_ERROR };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const snapshot = await Promise.race([
      loadArenaSnapshot(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error('arena_hydration_timeout'), { code: 'timeout' }));
        }, ARENA_HYDRATION_TIMEOUT_MS);
      }),
    ]);
    return { ok: true, snapshot };
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.message === 'arena_hydration_timeout' ||
        (error as { code?: string }).code === 'timeout');
    if (timedOut) {
      logger.warn('arena hydration timed out', { ms: ARENA_HYDRATION_TIMEOUT_MS });
      return {
        ok: false,
        reason: 'timeout',
        message: arenaHydrationTimeoutMessage(),
      };
    }
    logger.captureException(error, { source: 'loadArena' });
    return { ok: false, reason: 'backend', message: ARENA_LOAD_ERROR };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
