import type { Take } from '../store/types';

// Mirrors create_arena_challenge, not the shorter legacy start_clash window.
export const DUEL_WINDOW_MS = 30 * 60 * 1000;
export type ChallengeIneligibility = 'unavailable' | 'archived' | 'duel_window' | 'active_duel';

/** A UI veto only: permission to create always comes from the RPC. */
export function takeChallengeIneligibility(take: Take | null | undefined, now = Date.now(), legacy = false): ChallengeIneligibility | null {
  if (!take || !Number.isFinite(take.expiresAt)) return 'unavailable';
  if (take.status === 'expired' || take.expiresAt <= now) return 'archived';
  if (take.status && take.status !== 'active') return 'unavailable';
  if (!legacy && take.isRuntimeFixture) return 'unavailable';
  if (!legacy && take.expiresAt <= now + DUEL_WINDOW_MS) return 'duel_window';
  return null;
}

export function challengeIneligibilityMessage(reason: ChallengeIneligibility): string {
  switch (reason) {
    case 'archived': return 'This Take is archived. New challenges are closed.';
    case 'duel_window': return 'New challenges are closed: a duel needs more than 30 minutes remaining on this Take.';
    case 'active_duel': return 'This Take already has an active duel. You can still view its discussion and history.';
    default: return 'This Take is not available for new challenges.';
  }
}
