/**
 * Pure helpers for Arena "What's happening" moments.
 * Real pulse leaders + battle events only — never invent activity.
 */

import type { ArenaPulseLeader } from '../services/liveArenaService';
import type { ArenaBattleEventKind } from './arenaGameState';
import type { LiveRoomEvent } from './liveRoomEvents';

export type BattleMomentKind =
  | 'FAST_RISING'
  | 'TOP_ARGUMENT'
  | 'BEST_EVIDENCE'
  | 'BEST_REBUTTAL'
  | 'CROWD_FAVORITE'
  | 'BACKUP'
  | 'JUDGING'
  | 'RESULT'
  | 'EVIDENCE_SURGE'
  | 'CLASH'
  | 'PHASE';

export interface BattleMomentModel {
  kind: BattleMomentKind;
  /** Short kicker shown above the moment. */
  kicker: string;
  /** Optional @handle / name. */
  who: string | null;
  /** Preview body — omit when empty. */
  preview: string | null;
  /** Entertainment (crowd) vs argument quality — drives visual tone. */
  entertainment: boolean;
  /** Stable key for list/animation. */
  key: string;
}

const PULSE_PRIORITY: ArenaPulseLeader['category'][] = [
  'FAST_RISING',
  'CROWD_FAVORITE',
  'BEST_EVIDENCE',
  'BEST_REBUTTAL',
  'TOP_ARGUMENT',
];

const PULSE_KICKER: Record<ArenaPulseLeader['category'], string> = {
  FAST_RISING: '🔥 FAST RISING',
  TOP_ARGUMENT: '⚔ TOP ARGUMENT',
  BEST_EVIDENCE: '🧾 BEST EVIDENCE',
  BEST_REBUTTAL: '⚔ BEST REBUTTAL',
  CROWD_FAVORITE: '💀 CROWD LOST IT',
};

export function pulseLeaderToMoment(leader: ArenaPulseLeader): BattleMomentModel {
  return {
    kind: leader.category,
    kicker: PULSE_KICKER[leader.category] ?? leader.label.toUpperCase(),
    who: leader.author ? `@${leader.author.handle || leader.author.name}` : null,
    preview: leader.preview?.trim() || null,
    entertainment: leader.category === 'CROWD_FAVORITE' || leader.category === 'FAST_RISING',
    key: `pulse:${leader.category}:${leader.messageId ?? leader.evidenceId ?? ''}`,
  };
}

/** Pick up to `limit` pulse moments with battle-story priority (not equal cards). */
export function selectFeaturedPulseMoments(
  leaders: readonly ArenaPulseLeader[],
  limit = 2,
): BattleMomentModel[] {
  if (leaders.length === 0 || limit <= 0) return [];
  const byCat = new Map(leaders.map((l) => [l.category, l]));
  const ordered: ArenaPulseLeader[] = [];
  for (const cat of PULSE_PRIORITY) {
    const hit = byCat.get(cat);
    if (hit) ordered.push(hit);
  }
  for (const leader of leaders) {
    if (!ordered.includes(leader)) ordered.push(leader);
  }
  return ordered.slice(0, limit).map(pulseLeaderToMoment);
}

export function liveEventToMoment(event: LiveRoomEvent): BattleMomentModel | null {
  switch (event.kind) {
    case 'backup_called':
      return {
        kind: 'BACKUP',
        kicker: '⚔ BACKUP CALLED',
        who: null,
        preview: event.label,
        entertainment: false,
        key: `event:backup_called`,
      };
    case 'backup_arrived':
      return {
        kind: 'BACKUP',
        kicker: '🛡 BACKUP ARRIVED',
        who: null,
        preview: event.label,
        entertainment: false,
        key: `event:backup_arrived`,
      };
    case 'evidence_surge':
      return {
        kind: 'EVIDENCE_SURGE',
        kicker: '🧾 RECEIPTS',
        who: null,
        preview: event.label,
        entertainment: false,
        key: `event:evidence_surge`,
      };
    case 'judging':
      return {
        kind: 'JUDGING',
        kicker: '⚖ JUDGING',
        who: null,
        preview: event.label,
        entertainment: false,
        key: `event:judging`,
      };
    case 'result':
      return {
        kind: 'RESULT',
        kicker: '◆ ROOM DECIDED',
        who: null,
        preview: event.label,
        entertainment: false,
        key: `event:result`,
      };
    case 'pulse_rising':
      return {
        kind: 'FAST_RISING',
        kicker: '🔥 FAST RISING',
        who: null,
        preview: event.label,
        entertainment: true,
        key: `event:pulse_rising`,
      };
    case 'final_arguments':
      return {
        kind: 'CLASH',
        kicker: '⚔ FINAL ARGUMENTS',
        who: null,
        preview: event.label,
        entertainment: false,
        key: `event:final_arguments`,
      };
    default:
      return null;
  }
}

/** Map battle-event kinds to short burst animation keys. */
export type BattleBurstKind =
  | 'clash'
  | 'backup_called'
  | 'backup_arrived'
  | 'receipts'
  | 'fast_rising'
  | 'judging'
  | 'result'
  | 'mindshift';

export function battleEventBurstKind(kind: ArenaBattleEventKind): BattleBurstKind | null {
  switch (kind) {
    case 'BACKUP_CALLED':
      return 'backup_called';
    case 'BACKUP_ARRIVED':
      return 'backup_arrived';
    case 'EVIDENCE_SURGED':
      return 'receipts';
    case 'FAST_RISING_CHANGED':
      return 'fast_rising';
    case 'JUDGING_STARTED':
      return 'judging';
    case 'RESULT_SETTLED':
      return 'result';
    case 'PHASE_CHANGED':
      return 'clash';
    default:
      return null;
  }
}
