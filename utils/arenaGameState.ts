/**
 * Pure presentation rules for the Arena game layer (Phase 14).
 *
 * No React, no network: every function here is a function of its arguments, so
 * the honesty rules of Call Backup — capacity truth, expiry, cooldowns, opt-out
 * and the "reactions are not judgement" separation — are unit testable.
 *
 * Nothing in this file invents a status. If the server said `room_full`, the UI
 * says the room is full and offers spectating; it never quietly lets someone in.
 */

import type { LiveRoomEvent } from './liveRoomEvents';

export type ArenaBackupPolicy = 'EVERYONE' | 'FOLLOWING' | 'NOBODY';
export type ArenaBackupStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';
export type ArenaStanding = 'NEWCOMER' | 'CONTRIBUTOR' | 'DEBATER' | 'VETERAN';
export type ArenaBattleEventKind =
  | 'BACKUP_CALLED'
  | 'BACKUP_ARRIVED'
  | 'BACKUP_DECLINED'
  | 'BACKUP_EXPIRED'
  | 'EVIDENCE_SURGED'
  | 'FAST_RISING_CHANGED'
  | 'PHASE_CHANGED'
  | 'JUDGING_STARTED'
  | 'RESULT_SETTLED';

/**
 * The compact Arena palette. The server owns the allowlist
 * (`arena_reaction_vocabulary`); this is the same vocabulary for the UI, and a
 * reaction is never a judgement vote.
 */
export const ARENA_REACTIONS: { emoji: string; label: string }[] = [
  { emoji: '🔥', label: 'Cooked' },
  { emoji: '🧢', label: 'Cap' },
  { emoji: '🧾', label: 'Receipts' },
  { emoji: '💀', label: "Bro..." },
  { emoji: '🤯', label: 'Plot twist' },
  { emoji: '⚔', label: 'Called out' },
  { emoji: '🧠', label: 'Changed my mind' },
];

export const ARENA_BACKUP_TTL_MS = 10 * 60 * 1000;

export function standingLabel(standing: ArenaStanding): string {
  switch (standing) {
    case 'VETERAN':
      return 'Veteran';
    case 'DEBATER':
      return 'Debater';
    case 'CONTRIBUTOR':
      return 'Contributor';
    default:
      return 'Newcomer';
  }
}

export function backupPolicyLabel(policy: ArenaBackupPolicy): string {
  switch (policy) {
    case 'FOLLOWING':
      return 'People I follow';
    case 'NOBODY':
      return 'Nobody';
    default:
      return 'Everyone eligible';
  }
}

/** "Arena Expert · Same hood · Strong debater" — real reasons only. */
export function candidateSubtitle(input: {
  standing: ArenaStanding;
  reasons: string[];
}): string {
  const reason = input.reasons[0] ?? standingLabel(input.standing);
  return input.reasons.length > 0
    ? `${reason} · ${standingLabel(input.standing)}`
    : standingLabel(input.standing);
}

/** "ROOM 7 NEEDS YOU" — the room's place in the day, never a fake id. */
export function incomingCallHeadline(roomIndex: number): string {
  return roomIndex > 0 ? `ROOM ${roomIndex} NEEDS YOU` : 'YOUR ROOM NEEDS YOU';
}

export function incomingCallBody(topicTitle: string, callerName: string): string {
  return `${callerName} called you into "${topicTitle}".`;
}

export function arrivalBanner(handle: string): string {
  return `Backup arrived · @${handle}`;
}

export function expiredCallCopy(): string {
  return 'That call expired before it was answered.';
}

export function roomFullCopy(): string {
  return 'That room is full. You can still watch from the floor.';
}

export function optOutCopy(): string {
  return 'Backup requests are off. Nobody can call you into a room.';
}

/** Standing never bypasses a limit; say so plainly where it matters. */
export function reputationIsNotKarmaCopy(): string {
  return 'Reputation unlocks who can summon whom. It never bypasses limits, blocks or capacity.';
}

/** Remaining seconds on a live call, or null when there is nothing to count. */
export function callSecondsLeft(expiresAt: number, now: number): number | null {
  if (!Number.isFinite(expiresAt)) return null;
  return Math.max(0, Math.round((expiresAt - now) / 1000));
}

/**
 * Turn a stored battle event into the room's existing banner vocabulary.
 * Presentation is decided here; the database only ever stored truth.
 */
export function battleEventToRoomEvent(input: {
  kind: ArenaBattleEventKind;
  actorName: string | null;
  payload: Record<string, unknown>;
}): LiveRoomEvent | null {
  switch (input.kind) {
    case 'BACKUP_CALLED':
      return { kind: 'backup_called', label: 'Backup called into the room' };
    case 'BACKUP_ARRIVED':
      return { kind: 'backup_arrived', label: arrivalBanner(input.actorName ?? 'backup') };
    case 'BACKUP_EXPIRED':
      return { kind: 'backup_expired', label: 'A call went unanswered' };
    case 'EVIDENCE_SURGED': {
      // The trigger stores `recentCount`; nothing else is invented.
      const count = typeof input.payload.recentCount === 'number' ? input.payload.recentCount : null;
      return {
        kind: 'evidence_surge',
        label: count !== null ? `${count} receipts just landed` : 'Receipts are landing',
      };
    }
    case 'JUDGING_STARTED':
      return { kind: 'judging', label: 'Judging is open — the room decides' };
    case 'RESULT_SETTLED':
      return { kind: 'result', label: 'Result is in' };
    case 'PHASE_CHANGED':
      return { kind: 'phase', label: 'Phase changed' };
    default:
      return null;
  }
}

/** The most recent non-silent moment, for a single floating banner. */
export function latestBattleEvent(
  events: { kind: ArenaBattleEventKind; actorName: string | null; payload: Record<string, unknown> }[],
): LiveRoomEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const mapped = battleEventToRoomEvent(events[i]);
    if (mapped) return mapped;
  }
  return null;
}
