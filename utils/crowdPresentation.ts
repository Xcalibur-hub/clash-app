/**
 * Crowd presentation rules: timestamps, honest audience labels and scroll
 * decisions. Pure arithmetic only — no timers, no subscriptions, no invented
 * values. Every label is derived from server-reported fields.
 */

/** Relative label for a real row. Invalid dates render nothing at all. */
export function crowdTimeLabel(createdAt: string, now: number): string {
  const then = Date.parse(createdAt);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return '';
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 45) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export interface CrowdAudience {
  /** Server-reported spectators, when the payload carries them. */
  spectatorCount?: number | null;
  /** Membership count. Presented as "joined", never as viewers. */
  participantCount?: number | null;
}

/**
 * Honest audience label. Spectators are only claimed when the server supplied
 * a spectator count; otherwise the membership count is labelled "joined".
 * Nothing is extrapolated, sampled or rounded up.
 */
export function crowdAudienceLabel(audience: CrowdAudience): string | null {
  const spectators = audience.spectatorCount;
  if (typeof spectators === 'number' && Number.isFinite(spectators) && spectators >= 0) {
    const count = Math.floor(spectators);
    return `${count} spectator${count === 1 ? '' : 's'}`;
  }
  const joined = audience.participantCount;
  if (typeof joined === 'number' && Number.isFinite(joined) && joined >= 0) {
    return `${Math.floor(joined)} joined`;
  }
  return null;
}

export interface CrowdScrollInput {
  offsetY: number;
  layoutHeight: number;
  contentHeight: number;
  /** Distance from the end that still counts as reading the live edge. */
  threshold?: number;
}

/** Compare precise server cursors; deletion, pagination and replay are not arrivals. */
export function newerCrowdMessage(
  previous: { id: string; createdAt: string } | null | undefined,
  next: { id: string; createdAt: string } | null | undefined,
): boolean {
  if (!previous || !next || previous.id === next.id) return false;
  return next.createdAt > previous.createdAt ||
    (next.createdAt === previous.createdAt && next.id > previous.id);
}

/** True when the reader is at (or within the threshold of) the newest row. */
export function crowdAtLiveEdge({
  offsetY,
  layoutHeight,
  contentHeight,
  threshold = 40,
}: CrowdScrollInput): boolean {
  if (![offsetY, layoutHeight, contentHeight, threshold].every(Number.isFinite)) return true;
  return offsetY + layoutHeight >= contentHeight - threshold;
}

/**
 * Whether the "New messages" affordance should be visible. Arrivals are only
 * surfaced when the reader is away from the live edge; returning to the edge
 * always clears it. Nothing here counts unseen rows.
 */
export function crowdUnseenAfterArrival({
  atLiveEdge,
  latestChanged,
  unseen,
}: {
  atLiveEdge: boolean;
  latestChanged: boolean;
  unseen: boolean;
}): boolean {
  if (atLiveEdge) return false;
  if (latestChanged) return true;
  return unseen;
}
