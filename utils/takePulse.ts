/**
 * Pulse badges for Fresh Takes — derived only from real store metrics.
 * Never invents engagement or live status.
 */
import type { Take } from '../store/types';

export type TakePulse = 'live' | 'hot' | 'rising' | null;

const HOUR = 60 * 60 * 1000;

function heat(take: Take): number {
  return take.clashes * 3 + take.reactions;
}

/**
 * - live  → at least one Clash on this Take
 * - hot   → meaningful real engagement (heat ≥ 12)
 * - rising → young Take (< 2h) with at least one reaction
 */
export function takePulse(take: Take, now: number = Date.now()): TakePulse {
  if (take.clashes > 0) return 'live';
  if (heat(take) >= 12) return 'hot';
  if (now - take.createdAt < 2 * HOUR && take.reactions > 0) return 'rising';
  return null;
}
