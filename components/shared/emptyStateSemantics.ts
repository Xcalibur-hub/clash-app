/**
 * Empty-state semantics — pure, testable, no React.
 *
 * Phase 1 blocker 5: every failure rendered one hardcoded eyebrow,
 * `SOMETHING WENT WRONG`. That is accurate for a server error and misleading for
 * a blocked profile, where nothing went wrong and retrying cannot help. The
 * mapping lives here so it can be asserted directly.
 */

export type EmptyStateVariant = 'quiet' | 'error' | 'offline' | 'denied' | 'blocked' | 'alert';

/**
 * What the eyebrow says.
 *
 * Each string answers "what is this?" rather than "something is wrong": a user
 * who reads `NO CONNECTION` knows to check Wi-Fi, while `SOMETHING WENT WRONG`
 * leaves them to retry a button that cannot succeed.
 */
const EYEBROW: Record<EmptyStateVariant, string> = {
  quiet: 'NOTHING HERE YET',
  error: 'COULD NOT LOAD',
  offline: 'NO CONNECTION',
  denied: 'NOT AVAILABLE TO YOU',
  blocked: 'ACCESS REMOVED',
  alert: 'COULD NOT LOAD',
};

/**
 * States whose cause is the viewer's own situation, not a failing server.
 *
 * These must not be painted in the danger colour: a restriction is a fact, not
 * an alarm, and colouring it red tells the user something broke.
 */
const NOT_A_FAILURE: ReadonlySet<EmptyStateVariant> = new Set(['quiet', 'denied', 'blocked']);

export function emptyStateEyebrow(variant: EmptyStateVariant = 'quiet'): string {
  return EYEBROW[variant] ?? EYEBROW.quiet;
}

/** Which accent the state should carry. */
export function emptyStateAccentKind(variant: EmptyStateVariant = 'quiet'): 'danger' | 'brand' {
  return NOT_A_FAILURE.has(variant) ? 'brand' : 'danger';
}

/** True when offering the user a retry action makes sense. */
export function emptyStateIsRetryable(variant: EmptyStateVariant = 'quiet'): boolean {
  return variant === 'error' || variant === 'offline' || variant === 'alert';
}
