/**
 * Challenge invitation / inbox presentation (UI Phase 5).
 * Pure copy and a11y helpers — no RPC, ranking, or lifecycle changes.
 */
import type { ArenaChallenge, ChallengeStatus } from './arenaChallengePayload.ts';
import { challengeCanAct } from './arenaChallengePayload.ts';

export type ChallengeTone = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';

export interface ChallengeStatusPresentation {
  label: string;
  tone: ChallengeTone;
  summary: string;
}

/** Mirrors challengeInbox.challengeStatusLabel — keep PASSED → Declined. */
function statusLabel(status: ChallengeStatus): string {
  return status === 'PASSED' ? 'Declined' : status.charAt(0) + status.slice(1).toLowerCase();
}

/** Human status chip — declined maps PASSED → Declined. */
export function challengeStatusPresentation(status: ChallengeStatus): ChallengeStatusPresentation {
  switch (status) {
    case 'PENDING':
      return {
        label: statusLabel(status),
        tone: 'pending',
        summary: 'Waiting for a decision.',
      };
    case 'ACCEPTED':
      return {
        label: statusLabel(status),
        tone: 'accepted',
        summary: 'Both fighters are set. Open the Room when it is ready.',
      };
    case 'PASSED':
      return {
        label: statusLabel(status),
        tone: 'declined',
        summary: 'This invitation was passed.',
      };
    case 'CANCELLED':
      return {
        label: statusLabel(status),
        tone: 'cancelled',
        summary: 'This invitation was withdrawn.',
      };
    case 'EXPIRED':
      return {
        label: statusLabel(status),
        tone: 'expired',
        summary: 'The deadline passed. Discussion history remains.',
      };
  }
}

export function challengeInvitationHeadline(hasChallenge: boolean): string {
  return hasChallenge ? 'Your Take started a conversation.' : "You're all caught up.";
}

export function challengeEligibilityCopy(eligible: boolean): string {
  return eligible
    ? 'Accept to enter a live 1v1. Only you two can publish official arguments.'
    : 'This invitation is no longer actionable. Discussion and history remain available.';
}

export function challengeRemainingCopy(remaining: number, busy: boolean): string {
  if (busy) return 'Waiting for confirmation…';
  if (remaining <= 0) return 'No pending invitations';
  return `${remaining} invitation${remaining === 1 ? '' : 's'} · One decision at a time`;
}

/**
 * Accept / Pass accessibility — button equivalents of swipe right / left.
 * Semantics stay aligned with utils/challengeSwipe.ts.
 */
export function challengeActionAccessibility(decision: 'accept' | 'pass'): {
  label: string;
  hint: string;
} {
  if (decision === 'accept') {
    return {
      label: 'Accept this challenge',
      hint: 'Same as swiping right. Opens your Live Room after confirmation.',
    };
  }
  return {
    label: 'Pass on this challenge',
    hint: 'Same as swiping left. Declines this invitation.',
  };
}

export function challengeInboxActorRole(direction: 'INCOMING' | 'OUTGOING'): string {
  return direction === 'INCOMING' ? 'Challenger' : 'Opponent';
}

/** Local UI gate only — server status remains authoritative after act. */
export function challengeInvitationActionable(
  challenge: ArenaChallenge | null,
  now = Date.now(),
): boolean {
  return challenge != null && challengeCanAct(challenge, now);
}

/** One-shot Arena entrance duration; skip is always available. */
export function duelEntranceDurationMs(reducedMotion: boolean): number {
  return reducedMotion ? 120 : 620;
}
