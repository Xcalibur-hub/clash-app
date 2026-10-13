/**
 * Explore payload reporting — telling "the server sent nothing" apart from
 * "the server sent rows we could not read".
 *
 * Mapping can legitimately drop a row (a required field missing or the wrong type). Until now that
 * was indistinguishable from an empty result, so a broken contract looked like an empty Explore.
 * These helpers carry COUNTS ONLY: no payload value ever reaches a message, a log or a screen, so
 * a rejected row cannot leak its contents.
 */

export interface ExplorePayloadReport {
  /** Rows the RPC returned. */
  received: number;
  /** Rows that mapped and are safe to render. */
  mapped: number;
  /** Rows the mapper rejected. */
  rejected: number;
}

export type ExplorePayloadState = 'ok' | 'partial' | 'all_rejected' | 'empty';

/** Builds a report, clamped so a miscount can never produce a negative or impossible pair. */
export function explorePayloadReport(received: number, mapped: number): ExplorePayloadReport {
  const total = Number.isFinite(received) ? Math.max(0, Math.trunc(received)) : 0;
  const kept = Number.isFinite(mapped) ? Math.min(total, Math.max(0, Math.trunc(mapped))) : 0;
  return { received: total, mapped: kept, rejected: total - kept };
}

/**
 * `empty` — the RPC genuinely returned nothing (keep the existing empty copy).
 * `all_rejected` — rows arrived and every one was unreadable (this is a data error, not emptiness).
 * `partial` — some rows were usable; the rest were rejected.
 */
export function explorePayloadState(report: ExplorePayloadReport): ExplorePayloadState {
  if (report.received === 0) return 'empty';
  if (report.mapped === 0) return 'all_rejected';
  if (report.rejected > 0) return 'partial';
  return 'ok';
}

/**
 * User-facing copy for a state, or null when there is nothing to say.
 * `empty` and `ok` deliberately return null so the caller's existing empty and success
 * behaviour is preserved exactly.
 */
export function explorePayloadMessage(
  state: ExplorePayloadState,
  subject = 'Explore',
): string | null {
  if (state === 'all_rejected') return `${subject} could not read what the server sent. Try again.`;
  if (state === 'partial') return `Some ${subject.toLowerCase()} items could not be shown.`;
  return null;
}

/** True when the state must be shown as a retryable error rather than an empty state. */
export function explorePayloadNeedsRetry(state: ExplorePayloadState): boolean {
  return state === 'all_rejected';
}
