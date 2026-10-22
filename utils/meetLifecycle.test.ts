import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createMeetRequestGuard,
  MEET_HEARTBEAT_MS,
  MEET_MAX_POLL_MS,
  MEET_QUEUE_TTL_MS,
  meetActiveSessionChannel,
  meetCanSend,
  meetCancelVsMatch,
  meetChatStatus,
  meetHeartbeatDue,
  meetIsTerminalError,
  meetPollDelay,
  meetQueueOutcome,
  meetStatusIsTerminal,
  mergeMeetMessages,
  type MeetChatStatus,
  type MeetLifecycleSession,
} from './meetLifecycle.ts';

const active = (peerConnected = true): MeetLifecycleSession => ({
  status: 'active',
  peerConnected,
  endReason: null,
});

const ended = (
  endReason: string | null = 'leave',
  peerConnected = false,
): MeetLifecycleSession => ({
  status: 'ended',
  peerConnected,
  endReason,
});

describe('meetChatStatus', () => {
  it('reports connected only while the session is active and the peer is present', () => {
    assert.equal(meetChatStatus(active(true)), 'connected');
    assert.equal(meetChatStatus(active(false)), 'disconnected');
  });

  it('treats an ended session as terminal even if the payload still says connected', () => {
    // Stale-poll guard: a payload captured before leave can carry peerConnected.
    assert.equal(meetChatStatus(ended('leave', true)), 'ended');
    assert.equal(meetChatStatus(ended(null, true)), 'ended');
  });

  it('maps the server expired reason to its own terminal status', () => {
    assert.equal(meetChatStatus(ended('expired')), 'expired');
  });
});

describe('meetStatusIsTerminal / meetCanSend', () => {
  it('only connected chats accept writes', () => {
    assert.equal(meetCanSend('connected'), true);
    assert.equal(meetCanSend('disconnected'), false);
    assert.equal(meetCanSend('ended'), false);
    assert.equal(meetCanSend('expired'), false);
  });

  it('ended and expired are terminal, live states are not', () => {
    assert.equal(meetStatusIsTerminal('ended'), true);
    assert.equal(meetStatusIsTerminal('expired'), true);
    assert.equal(meetStatusIsTerminal('connected'), false);
    assert.equal(meetStatusIsTerminal('disconnected'), false);
  });

  it('a stale "active" payload cannot revive a terminal chat', () => {
    // Mirrors the absorbing rule in useMeetChat.commitStatus.
    const absorb = (current: MeetChatStatus, incoming: MeetChatStatus): MeetChatStatus =>
      meetStatusIsTerminal(current) && !meetStatusIsTerminal(incoming) ? current : incoming;

    assert.equal(absorb('ended', meetChatStatus(active(true))), 'ended');
    assert.equal(absorb('expired', meetChatStatus(active(true))), 'expired');
    assert.equal(absorb('connected', meetChatStatus(ended('leave'))), 'ended');
  });

describe('meetQueueOutcome', () => {
  const now = 1_700_000_000_000;

  it('keeps waiting while the row is fresh', () => {
    assert.equal(meetQueueOutcome({ queued: true, matched: false, queuedAt: now }, now), 'searching');
    assert.equal(meetQueueOutcome({ queued: true, matched: false }, now), 'searching');
  });

  it('gives up once the server sweep window has passed', () => {
    assert.equal(
      meetQueueOutcome({ queued: true, matched: false, queuedAt: now - MEET_QUEUE_TTL_MS }, now),
      'searching',
    );
    assert.equal(
      meetQueueOutcome(
        { queued: true, matched: false, queuedAt: now - MEET_QUEUE_TTL_MS - 1 },
        now,
      ),
      'lost',
    );
  });

  it('accepts a match whose session is still active', () => {
    const session = active(true);
    assert.equal(meetQueueOutcome({ queued: true, matched: true, session }, now), 'matched');
    assert.equal(
      meetQueueOutcome({ queued: false, matched: false, alreadyActive: true, session }, now),
      'matched',
    );
  });

  it('rejects a match whose session already ended', () => {
    const session = ended('leave');
    assert.equal(meetQueueOutcome({ queued: true, matched: true, session }, now), 'lost');
    assert.equal(
      meetQueueOutcome({ queued: false, matched: false, alreadyActive: true, session }, now),
      'lost',
    );
  });

  it('rejects a match with no session payload and an empty queue answer', () => {
    assert.equal(meetQueueOutcome({ queued: false, matched: true, session: null }, now), 'lost');
    assert.equal(meetQueueOutcome({ queued: false, matched: false, session: null }, now), 'lost');
  });
});

describe('meetActiveSessionChannel', () => {
  it('flags a resumed session that belongs to the other flow', () => {
    assert.equal(meetActiveSessionChannel('TEXT', 'TEXT'), 'same-channel');
    assert.equal(meetActiveSessionChannel('VIDEO', 'VIDEO'), 'same-channel');
    assert.equal(meetActiveSessionChannel('TEXT', 'VIDEO'), 'other-channel');
  });
});


describe('meetPollDelay', () => {
  it('returns the base cadence without failures', () => {
    assert.equal(meetPollDelay(2000, 0), 2000);
    assert.equal(meetPollDelay(2000, Number.NaN), 2000);
  });

  it('doubles per failure and caps at the ceiling', () => {
    assert.equal(meetPollDelay(2000, 1), 4000);
    assert.equal(meetPollDelay(2000, 2), 8000);
    assert.equal(meetPollDelay(2000, 3), 16_000);
    assert.equal(meetPollDelay(2000, 4), MEET_MAX_POLL_MS);
    assert.equal(meetPollDelay(2000, 40), MEET_MAX_POLL_MS);
  });

  it('never returns a sub-250ms delay', () => {
    assert.equal(meetPollDelay(50, 0), 250);
    assert.equal(meetPollDelay(0, 0), 250);
  });

  it('honours a custom ceiling', () => {
    assert.equal(meetPollDelay(1000, 5, 5000), 5000);
  });
});

describe('createMeetRequestGuard', () => {
  it('keeps only the newest token current', () => {
    const guard = createMeetRequestGuard();
    const first = guard.begin();
    assert.equal(guard.isCurrent(first), true);
    const second = guard.begin();
    assert.equal(guard.isCurrent(first), false);
    assert.equal(guard.isCurrent(second), true);
  });

  it('drops every outstanding token on invalidate', () => {
    const guard = createMeetRequestGuard();
    const token = guard.begin();
    guard.invalidate();
    assert.equal(guard.isCurrent(token), false);
  });
});

describe('mergeMeetMessages', () => {
  const first = { id: 'a', createdAt: 2 };
  const second = { id: 'b', createdAt: 1 };

  it('dedupes by id so overlapping polls cannot double-bubble', () => {
    assert.deepEqual(mergeMeetMessages([first], [first]), [first]);
  });

  it('sorts a late page into place even when it arrives out of order', () => {
    assert.deepEqual(mergeMeetMessages([first], [second]), [second, first]);
  });

  it('is idempotent and returns the same array when nothing changed', () => {
    const current = [second, first];
    assert.equal(mergeMeetMessages(current, [first, second]), current);
  });
});

describe('meetIsTerminalError', () => {
  it('treats closed-session and permission errors as end-of-conversation', () => {
    assert.equal(meetIsTerminalError('P0002'), true);
    assert.equal(meetIsTerminalError('P0003'), true);
    assert.equal(meetIsTerminalError('42501'), true);
  });

  it('keeps transport and validation errors retryable', () => {
    assert.equal(meetIsTerminalError(null), false);
    assert.equal(meetIsTerminalError(undefined), false);
    assert.equal(meetIsTerminalError(''), false);
    assert.equal(meetIsTerminalError('P0001'), false);
    assert.equal(meetIsTerminalError('23505'), false);
  });
});

describe('meetHeartbeatDue', () => {
  it('beats immediately when the screen has never beaten', () => {
    assert.equal(meetHeartbeatDue(null, 1_000), true);
  });

  it('does not stack beats inside the cadence', () => {
    assert.equal(meetHeartbeatDue(1_000, 1_000 + MEET_HEARTBEAT_MS - 1), false);
  });

  it('beats once the cadence has elapsed', () => {
    assert.equal(meetHeartbeatDue(1_000, 1_000 + MEET_HEARTBEAT_MS), true);
  });

  it('beats after a backwards clock jump instead of idling forever', () => {
    assert.equal(meetHeartbeatDue(50_000, 1_000), true);
  });

  it('ignores a non-finite clock reading', () => {
    assert.equal(meetHeartbeatDue(1_000, Number.NaN), false);
  });
});

describe('meetCancelVsMatch', () => {
  it('discards a match that lands after the user cancelled', () => {
    assert.equal(meetCancelVsMatch(true, true), 'discard');
  });

  it('accepts a match when the search is still live', () => {
    assert.equal(meetCancelVsMatch(false, true), 'accept');
  });

  it('discards when there is no session to show', () => {
    assert.equal(meetCancelVsMatch(false, false), 'discard');
    assert.equal(meetCancelVsMatch(true, false), 'discard');
  });
});

});
