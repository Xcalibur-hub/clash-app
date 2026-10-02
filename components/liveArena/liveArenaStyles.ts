/**
 * Shared vocabulary for the Live Daily Arena surfaces.
 *
 * Calm premium: warm white in light, near-black in dark, soft radii, hairline
 * edges. No neon, no gaming HUD, no full-bleed gradients — the only moving part
 * is a slow live pulse.
 */
import type { SemanticTheme } from '../../theme';
import type { ArenaPhase, ArenaRoomStatus, ArenaWinningSide } from '../../services/liveArenaService';
import type { Stance } from '../../services/mindshiftService';

/** Live dot + LIVE wordmark tint. Restrained red, not an alert. */
export const LIVE_TINT = '#E5484D';

/** Opacity floor/ceiling of the live pulse, tuned to read as breathing. */
export const PULSE_MIN = 0.35;
export const PULSE_MAX = 1;

export const STANCE_LABEL: Record<Stance, string> = {
  AGREE: 'Agree',
  UNSURE: 'Unsure',
  DISAGREE: 'Disagree',
};

const PHASE_LABEL: Record<ArenaPhase, string> = {
  scheduled: 'Opens soon',
  open: 'Open floor',
  final_arguments: 'Final arguments',
  judging: 'Judging',
  closed: 'Closed',
};

/** Human phase name. Derived from the server clock, never a device timestamp. */
export function phaseLabel(phase: ArenaPhase): string {
  return PHASE_LABEL[phase];
}

const ROOM_STATUS_LABEL: Record<ArenaRoomStatus, string> = {
  OPEN: 'Open floor',
  FINAL_ARGUMENTS: 'Final arguments',
  JUDGING: 'Judging',
  SETTLED: 'Settled',
  CANCELLED: 'No verdict',
};

export function roomStatusLabel(status: ArenaRoomStatus): string {
  return ROOM_STATUS_LABEL[status];
}

export function winningSideLabel(side: ArenaWinningSide): string {
  if (side === 'DRAW') return 'Draw';
  return side === 'AGREE' ? 'Agree' : 'Disagree';
}

/** "4h 12m" / "18m" / "under a minute" from a whole-second server remainder. */
export function secondsLabel(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe < 60) return 'under a minute';
  const minutes = Math.floor(safe / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** The soft tinted plate used for chips and inline stats. */
export function softFill(t: SemanticTheme): string {
  return t.scheme === 'light' ? 'rgba(17,17,19,0.04)' : 'rgba(255,255,255,0.05)';
}
