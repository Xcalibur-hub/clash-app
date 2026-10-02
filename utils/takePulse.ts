/**
 * Pulse badges for Fresh Takes — derived only from real store metrics.
 * Never invents engagement or live status.
 *
 * `clash` means a 1v1 Clash exists on the Take — NOT Live Arena multiplayer.
 * Presentation copy is "IN A CLASH" / "CLASH", never "CLASH LIVE".
 */
import type { Take } from '../store/types';

export type TakePulse = 'clash' | 'hot' | 'rising' | null;

const HOUR = 60 * 60 * 1000;

function heat(take: Take): number {
  return take.clashes * 3 + take.reactions;
}

/**
 * - clash  → at least one Clash on this Take
 * - hot    → meaningful real engagement (heat ≥ 12)
 * - rising → young Take (< 2h) with at least one reaction
 */
export function takePulse(take: Take, now: number = Date.now()): TakePulse {
  if (take.clashes > 0) return 'clash';
  if (heat(take) >= 12) return 'hot';
  if (now - take.createdAt < 2 * HOUR && take.reactions > 0) return 'rising';
  return null;
}

export function pulseLabel(pulse: Exclude<TakePulse, null>): string {
  if (pulse === 'clash') return 'IN A CLASH';
  if (pulse === 'hot') return 'HOT';
  return 'RISING';
}
