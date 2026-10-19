/**
 * Named layout rules for the canonical Duel Stage.
 *
 * Pure arithmetic only: no React, no theme, no device access, so the split
 * between Stage and Crowd can be tested without rendering. These values were
 * previously inline magic numbers in ImmersiveClash.
 */

export type DuelStageMode = 'default' | 'judging' | 'condensed' | 'crowdExpanded';

/**
 * Share of the presentation area the Stage claims. The Crowd takes the
 * complement of the same split.
 */
export const DUEL_STAGE_SHARE: Record<DuelStageMode, number> = {
  default: 0.72,
  judging: 0.76,
  condensed: 0.3,
  crowdExpanded: 0.38,
};

/**
 * A collapsed Crowd must leave the Stage at least this share of the area.
 * Condensed and expanded-Crowd modes are deliberate exceptions.
 */
export const DUEL_STAGE_MIN_SHARE = 0.55;

/** Fixed Stage height while the Crowd is expanded or the keyboard is open. */
export const DUEL_COMPACT_STAGE_HEIGHT = 110;

/** The Crowd never collapses below its heading, stream and composer. */
export const DUEL_CROWD_MIN_HEIGHT = 134;

export interface DuelStageInput {
  judging: boolean;
  condensed: boolean;
  crowdExpanded: boolean;
}

/**
 * Judging outranks every other mode so the verdict is never squeezed by a
 * stale expand state; the keyboard (condensed) outranks an expanded Crowd.
 */
export function duelStageMode({ judging, condensed, crowdExpanded }: DuelStageInput): DuelStageMode {
  if (judging) return 'judging';
  if (condensed) return 'condensed';
  if (crowdExpanded) return 'crowdExpanded';
  return 'default';
}

export function duelStageShare(mode: DuelStageMode): number {
  return DUEL_STAGE_SHARE[mode];
}

/** Modes that pin the Stage to DUEL_COMPACT_STAGE_HEIGHT instead of a split. */
export function duelStageIsSummary(mode: DuelStageMode): boolean {
  return mode === 'condensed' || mode === 'crowdExpanded';
}

export interface DuelStageType {
  /** Narrow screen or enlarged system font: tighten the Stage type ramp. */
  compact: boolean;
  nameSize: number;
  nameLineHeight: number;
  positionSize: number;
  positionLineHeight: number;
  /** Line count for an accepted position. Never more than two. */
  positionLines: number;
  argumentSize: number;
  argumentLineHeight: number;
}

/**
 * Responsive type ramp for the Stage. A 320dp screen or a 1.3 system font
 * drops one step; nothing is capped, so the OS font scale still applies.
 */
export function duelStageType({ width, fontScale }: { width: number; fontScale: number }): DuelStageType {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 360;
  const safeScale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const compact = safeWidth < 380 || safeScale >= 1.25;
  return compact
    ? { compact, nameSize: 14, nameLineHeight: 19, positionSize: 11, positionLineHeight: 15, positionLines: 2, argumentSize: 16, argumentLineHeight: 22 }
    : { compact, nameSize: 15, nameLineHeight: 20, positionSize: 12, positionLineHeight: 16, positionLines: 2, argumentSize: 18, argumentLineHeight: 26 };
}
