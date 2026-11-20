/** Challenge invitation / inbox presentation + entrance duration. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ArenaChallenge } from './arenaChallengePayload.ts';
import {
  challengeActionAccessibility,
  challengeEligibilityCopy,
  challengeInboxActorRole,
  challengeInvitationActionable,
  challengeInvitationHeadline,
  challengeRemainingCopy,
  challengeStatusPresentation,
  duelEntranceDurationMs,
} from './challengePresentation.ts';

const pending = (overrides: Partial<ArenaChallenge> = {}): ArenaChallenge => ({
  id: 'ch-1',
  takeId: 'take-1',
  challengerId: 'u-a',
  challengedId: 'u-b',
  counterPosition: 'A different view that still meets the length requirement here.',
  status: 'PENDING',
  createdAt: '2026-10-20T10:00:00.000Z',
  expiresAt: '2099-10-21T10:00:00.000Z',
  resolvedAt: null,
  clashId: null,
  roomId: null,
  created: false,
  challenger: { id: 'u-a', name: 'Alex', handle: 'alex' },
  ...overrides,
});

describe('challenge presentation', () => {
  it('maps statuses including declined for PASSED', () => {
    assert.equal(challengeStatusPresentation('PENDING').label, 'Pending');
    assert.equal(challengeStatusPresentation('ACCEPTED').tone, 'accepted');
    assert.equal(challengeStatusPresentation('PASSED').label, 'Declined');
    assert.equal(challengeStatusPresentation('PASSED').tone, 'declined');
    assert.equal(challengeStatusPresentation('EXPIRED').tone, 'expired');
    assert.equal(challengeStatusPresentation('CANCELLED').tone, 'cancelled');
  });

  it('keeps invitation headlines and eligibility honest', () => {
    assert.match(challengeInvitationHeadline(true), /conversation/);
    assert.match(challengeInvitationHeadline(false), /caught up/);
    assert.match(challengeEligibilityCopy(true), /live 1v1/);
    assert.match(challengeEligibilityCopy(false), /no longer actionable/);
  });

  it('exposes accept/pass accessibility as swipe equivalents', () => {
    const accept = challengeActionAccessibility('accept');
    const pass = challengeActionAccessibility('pass');
    assert.match(accept.label, /Accept/i);
    assert.match(accept.hint, /swiping right/i);
    assert.match(pass.label, /Pass/i);
    assert.match(pass.hint, /swiping left/i);
  });

  it('distinguishes busy, remaining, and empty invitation copy', () => {
    assert.match(challengeRemainingCopy(2, true), /Waiting/);
    assert.match(challengeRemainingCopy(1, false), /1 invitation/);
    assert.match(challengeRemainingCopy(3, false), /3 invitations/);
    assert.match(challengeRemainingCopy(0, false), /No pending/);
  });

  it('gates actionable UI locally without inventing server status', () => {
    assert.equal(challengeInvitationActionable(pending()), true);
    assert.equal(
      challengeInvitationActionable(
        pending({ expiresAt: '2020-01-01T00:00:00.000Z' }),
      ),
      false,
    );
    assert.equal(
      challengeInvitationActionable(
        pending({
          status: 'ACCEPTED',
          resolvedAt: '2026-10-20T11:00:00.000Z',
          clashId: 'c1',
          roomId: 'r1',
        }),
      ),
      false,
    );
    assert.equal(challengeInvitationActionable(null), false);
  });

  it('labels inbox actors by direction', () => {
    assert.equal(challengeInboxActorRole('INCOMING'), 'Challenger');
    assert.equal(challengeInboxActorRole('OUTGOING'), 'Opponent');
  });

  it('shortens entrance for reduced motion', () => {
    assert.equal(duelEntranceDurationMs(true), 120);
    assert.equal(duelEntranceDurationMs(false), 620);
  });
});
