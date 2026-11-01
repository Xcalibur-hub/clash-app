/**
 * Pure state + copy helpers for Interactive Creator Live (Phase 15.4).
 *
 * Nothing here talks to the network or decides authority: totals, results and
 * triggers are server-computed. These helpers only shape what the server already
 * decided, so the live screen stays cheap to rerender.
 */

export type LiveStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
export type LiveInteractionType = 'POLL' | 'CHOICE' | 'CROWD_ACTION' | 'GAME_ACTION';
export type LiveInteractionStatus = 'OPEN' | 'CLOSED' | 'TRIGGERED' | 'CANCELLED';
export type LiveActionKind =
  | 'LIGHTS_OFF'
  | 'LIGHTS_ON'
  | 'OPEN_LEFT_DOOR'
  | 'OPEN_RIGHT_DOOR'
  | 'FOG_BURST'
  | 'MUSIC_STING'
  | 'CAMERA_CUT'
  | 'HOLD_FRAME';

export interface LiveOption {
  id: string;
  label: string;
}

export interface LiveTallies {
  [key: string]: number;
}

export interface LiveVoteIntent {
  kind: 'idle' | 'pending' | 'confirmed' | 'replayed' | 'rejected' | 'ambiguous';
  interactionId: string | null;
  myVote?: string | null;
}

export function liveVoteIntentLabel(intent: LiveVoteIntent): string | null {
  switch (intent.kind) {
    case 'pending': return 'Sending your choice…';
    case 'confirmed': return 'The server recorded your choice.';
    case 'replayed': return 'Your previously recorded choice is unchanged.';
    case 'rejected': return 'That choice was not accepted.';
    case 'ambiguous': return 'Delivery is uncertain. Check the latest recorded choice before trying again.';
    default: return null;
  }
}

export function liveResultWinner(result: Record<string, unknown> | null, total: number): string | null {
  return result && total > 0 && result.total !== 0 && result.tie !== true
    && result.outcome !== 'TIE' && result.outcome !== 'NO_BALLOTS' && typeof result.winner === 'string'
    ? result.winner : null;
}

export function liveResultLabel(result: Record<string, unknown> | null, total: number, options: readonly LiveOption[]): string | null {
  if (!result) return null;
  if (total === 0 || result.total === 0 || result.outcome === 'NO_BALLOTS') return 'No ballots were recorded.';
  if (result.tie === true || result.outcome === 'TIE') return 'The server recorded a tie.';
  const winner = liveResultWinner(result, total);
  return winner ? `Server result: ${options.find(item => item.id === winner)?.label ?? 'Result option unavailable'}`
    : 'No winning option was returned. This is not proof of an applied action.';
}

/** The badge over the stage. */
export function liveStatusLabel(status: LiveStatus): string {
  switch (status) {
    case 'LIVE':
      return 'LIVE';
    case 'SCHEDULED':
      return 'NEXT LIVE';
    case 'ENDED':
      return 'ENDED';
    default:
      return 'OFFLINE';
  }
}

export function interactionTypeLabel(type: LiveInteractionType): string {
  switch (type) {
    case 'POLL':
      return 'Poll';
    case 'CHOICE':
      return 'Choice';
    case 'CROWD_ACTION':
      return 'Crowd action';
    default:
      return 'Game action';
  }
}

/** What the viewer is asked to do — plain language, never a dashboard term. */
export function interactionPromptVerb(type: LiveInteractionType): string {
  switch (type) {
    case 'CROWD_ACTION':
      return 'Support';
    case 'GAME_ACTION':
      return 'Choose';
    default:
      return 'Vote';
  }
}

export function liveActionLabel(kind: LiveActionKind): string {
  switch (kind) {
    case 'LIGHTS_OFF':
      return 'Lights out';
    case 'LIGHTS_ON':
      return 'Lights on';
    case 'OPEN_LEFT_DOOR':
      return 'Left door opened';
    case 'OPEN_RIGHT_DOOR':
      return 'Right door opened';
    case 'FOG_BURST':
      return 'Fog burst';
    case 'MUSIC_STING':
      return 'Music sting';
    case 'CAMERA_CUT':
      return 'Camera cut';
    default:
      return 'Frame held';
  }
}

export function tallyFor(tallies: LiveTallies | null | undefined, optionId: string): number {
  const value = tallies?.[optionId];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function tallyTotal(tallies: LiveTallies | null | undefined): number {
  if (!tallies) return 0;
  let total = 0;
  for (const key of Object.keys(tallies)) {
    const value = tallies[key];
    if (typeof value === 'number' && Number.isFinite(value)) total += value;
  }
  return total;
}

/** 0..1 share of one option — used for the result bars. */
export function optionShare(tallies: LiveTallies | null | undefined, optionId: string): number {
  const total = tallyTotal(tallies);
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, tallyFor(tallies, optionId) / total));
}

export function thresholdProgress(total: number, threshold: number | null): number {
  if (threshold == null || threshold <= 0) return 0;
  return Math.min(1, Math.max(0, total / threshold));
}

export function thresholdRemaining(total: number, threshold: number | null): number {
  if (threshold == null) return 0;
  return Math.max(0, threshold - total);
}

export function hasReachedThreshold(total: number, threshold: number | null): boolean {
  if (threshold == null) return false;
  return total >= threshold;
}

/** The option currently in front — a live read of the server tallies. */
export function leadingOption(
  tallies: LiveTallies | null | undefined,
  options: readonly LiveOption[],
): LiveOption | null {
  let best: LiveOption | null = null;
  let bestCount = 0;
  for (const option of options) {
    const count = tallyFor(tallies, option.id);
    if (count > bestCount) {
      best = option;
      bestCount = count;
    }
  }
  return best;
}

/** Compact watch count that never lies about precision. */
export function watchingLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return 'No one watching yet';
  if (count === 1) return '1 watching';
  if (count < 1000) return `${count} watching`;
  const thousands = Math.round((count / 1000) * 10) / 10;
  return `${thousands}K watching`;
}

export function interactionIsOpen(
  status: LiveInteractionStatus,
  closesAt: number | null,
  now: number,
): boolean {
  if (status !== 'OPEN') return false;
  if (closesAt == null) return true;
  return closesAt > now;
}

/** 'Friday · 9 PM' style line for a scheduled session. */
export function scheduledLine(scheduledAt: number | null, now: number): string | null {
  if (scheduledAt == null) return null;
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) return null;
  const day = when.toLocaleDateString(undefined, { weekday: 'long' });
  const time = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (scheduledAt < now) return `${day} · ${time}`;
  return `${day} · ${time}`;
}
