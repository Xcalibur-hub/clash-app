/** Pure helpers for Challenge swipe commit thresholds. */

export const CHALLENGE_SWIPE_RATIO = 0.28;
export const CHALLENGE_SWIPE_VELOCITY = 900;

export type ChallengeSwipeDecision = 'accept' | 'pass' | null;

/** Right = accept, left = pass. Velocity can commit early. */
export function challengeSwipeDecision(
  translationX: number,
  velocityX: number,
  width: number,
): ChallengeSwipeDecision {
  if (!Number.isFinite(translationX) || !Number.isFinite(velocityX) || !Number.isFinite(width) || width <= 0) {
    return null;
  }
  const threshold = width * CHALLENGE_SWIPE_RATIO;
  if (translationX > threshold || velocityX > CHALLENGE_SWIPE_VELOCITY) return 'accept';
  if (translationX < -threshold || velocityX < -CHALLENGE_SWIPE_VELOCITY) return 'pass';
  return null;
}

/** 0–1 progress toward accept (right) or pass (left). */
export function challengeSwipeProgress(translationX: number, width: number): number {
  if (!Number.isFinite(translationX) || !Number.isFinite(width) || width <= 0) return 0;
  return Math.min(1, Math.abs(translationX) / (width * CHALLENGE_SWIPE_RATIO));
}
