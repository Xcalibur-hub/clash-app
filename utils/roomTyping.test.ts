import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatReplyTypingLabel,
  shouldRefreshTypingBroadcast,
  typersReplyingToViewer,
  typingExpired,
  TYPING_BROADCAST_MIN_MS,
  TYPING_IDLE_MS,
} from './roomTyping.ts';

const peer = (
  userId: string,
  replyingToMessageId: string | null,
  name = userId,
) => ({
  userId,
  handle: userId,
  name,
  replyingToMessageId,
});

describe('typing debounce', () => {
  it('broadcasts on first meaningful input', () => {
    assert.equal(shouldRefreshTypingBroadcast(null, 1000, true), true);
    assert.equal(shouldRefreshTypingBroadcast(null, 1000, false), false);
  });

  it('throttles until the min interval elapses', () => {
    assert.equal(shouldRefreshTypingBroadcast(1000, 1000 + TYPING_BROADCAST_MIN_MS - 1, true), false);
    assert.equal(shouldRefreshTypingBroadcast(1000, 1000 + TYPING_BROADCAST_MIN_MS, true), true);
  });
});

describe('typing expiry', () => {
  it('expires after idle window', () => {
    assert.equal(typingExpired(0, TYPING_IDLE_MS - 1), false);
    assert.equal(typingExpired(0, TYPING_IDLE_MS), true);
  });
});

describe('targeted reply typing', () => {
  it('only includes typers targeting the viewer arguments', () => {
    const viewerIds = new Set(['mine']);
    const peers = [
      peer('riya', 'mine', 'Riya'),
      peer('dev', 'other', 'Dev'),
      peer('viewer', 'mine', 'Me'),
    ];
    const targeted = typersReplyingToViewer(peers, viewerIds, 'viewer');
    assert.equal(targeted.length, 1);
    assert.equal(targeted[0]?.name, 'Riya');
  });

  it('aggregates 1 / 2 / 3+ / lots labels', () => {
    assert.equal(
      formatReplyTypingLabel([peer('riya', 'm', 'Riya')]),
      'Riya is replying to you…',
    );
    assert.equal(
      formatReplyTypingLabel([peer('riya', 'm', 'Riya'), peer('maya', 'm', 'Maya')]),
      'Riya and Maya are replying…',
    );
    assert.equal(
      formatReplyTypingLabel([
        peer('a', 'm', 'A'),
        peer('b', 'm', 'B'),
        peer('c', 'm', 'C'),
      ]),
      '3 people are replying…',
    );
    assert.equal(
      formatReplyTypingLabel(
        Array.from({ length: 6 }, (_, i) => peer(`u${i}`, 'm', `U${i}`)),
      ),
      'Lots of people are responding…',
    );
  });
});
