/**
 * Pure Stage motion / label gates for Immersive Live Duel.
 * No React — entrance keys and speaking/crowd chrome stay unit-testable.
 */

export type DuelTerminal = 'settled' | 'cancelled' | null | undefined;

/** One-shot key for the in-Stage fighter entrance (distinct from DuelEntrance overlay). */
export function stageEntranceKey(clashId: string, viewerScope: string): string {
  const clash = clashId.trim();
  const scope = viewerScope.trim() || clash;
  if (!clash) return '';
  return `stage-entrance:${clash}:${scope}`;
}

/**
 * SPEAKING is a live-only cue. Terminal and history views keep focus attribution
 * for accessibility but must not claim a fighter is still speaking.
 */
export function duelSpeakingCue(input: {
  live: boolean;
  terminal?: DuelTerminal;
  focusSide: 'A' | 'B' | null;
  side: 'A' | 'B';
}): boolean {
  if (!input.live || input.terminal === 'settled' || input.terminal === 'cancelled') return false;
  return input.focusSide === input.side;
}

/** Crowd chrome: live rooms stay LIVE; terminal/history drop the Live pulse wording. */
export function duelCrowdChrome(readOnly: boolean): { label: string; idleState: string } {
  if (readOnly) return { label: 'CROWD', idleState: 'Closed' };
  return { label: 'LIVE CROWD', idleState: 'Live' };
}
