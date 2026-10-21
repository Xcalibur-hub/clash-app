/**
 * Pure spectator presentation copy — Crowd empty/terminal and support labels.
 * No React; keeps Stage vs Crowd language testable without rendering.
 */

export type SpectatorCrowdMode = 'live' | 'readonly' | 'unavailable' | 'loading' | 'empty';

export function spectatorCrowdEmptyCopy(input: {
  readOnly: boolean;
  loading: boolean;
  hasContext: boolean;
  hasCrowdModel: boolean;
  unavailableReason?: string | null;
}): string {
  if (input.unavailableReason?.trim()) return input.unavailableReason.trim();
  if (input.loading) return 'Loading Crowd…';
  if (!input.hasContext) {
    return input.hasCrowdModel
      ? 'Crowd chat is unavailable.'
      : 'Enter the Clash to read Crowd chat.';
  }
  if (input.readOnly) return 'This Crowd is closed. Earlier messages stay visible.';
  return 'No Crowd messages yet. Be the first to say something.';
}

/** Support chrome must never read as official judging. */
export function spectatorSupportHint(): string {
  return 'SUPPORT THIS VISIT · NOT A JUDGEMENT';
}

export function spectatorReactionHint(): string {
  return 'React · not a vote';
}

export function privateAssistPrivacyLabel(fighterName: string, side: 'A' | 'B'): string {
  return `Private to ${fighterName} · Fighter ${side}`;
}
