/** Sliding-window eviction: bounds hold, replays stay silent, live still alerts. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCrowdArrivalTracker, CROWD_MAX_SEEN } from './crowdArrivals.ts';

describe('crowd sliding windows', () => {
  it('keeps bounds after replay-only updates and stays silent on tombstoned replays', () => {
    const tracker = createCrowdArrivalTracker();
    let all: string[] = [];
    for (let window = 0; window < 6; window += 1) {
      const page = Array.from({ length: 200 }, (_, i) => `w${window}-${i}`);
      all = [...all, ...page];
      tracker.observe(all, { atLiveEdge: false });
    }
    const retained = tracker.retention();
    assert.ok(retained.evicted >= 1, 'tombstones populated');
    assert.ok(retained.seen <= CROWD_MAX_SEEN, 'seen bounded');
    assert.ok(retained.evicted <= 500, 'tombstones bounded');

    // Replay-only update: silent, and bounds still hold.
    assert.equal(tracker.observe(all, { atLiveEdge: false }), false);
    assert.ok(tracker.retention().seen <= CROWD_MAX_SEEN);

    // A tombstoned id replayed through the live path stays silent.
    assert.equal(tracker.observe([{ id: 'w0-0', origin: 'live' }, ...all], { atLiveEdge: false }), false);
    assert.ok(tracker.retention().seen <= CROWD_MAX_SEEN);

    // A genuinely new live row alerts.
    assert.equal(tracker.observe([...all, { id: 'brand-new', origin: 'live' }], { atLiveEdge: false }), true);

    // Reset clears both sets.
    tracker.reset();
    assert.deepEqual(tracker.retention(), { seen: 0, evicted: 0 });
    tracker.observe(['a'], { atLiveEdge: false });
    assert.equal(tracker.observe(['a', 'b'], { atLiveEdge: false }), true);
  });
});
