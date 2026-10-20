/** Post-eviction replay must not re-raise the New messages alert. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCrowdArrivalTracker } from './crowdArrivals.ts';

describe('crowd seen-id eviction', () => {
  it('suppresses a replayed evicted id while keeping genuine live arrivals', () => {
    const tracker = createCrowdArrivalTracker();
    const base = Array.from({ length: 1100 }, (_, i) => `id-${i}`);
    tracker.observe(base, { atLiveEdge: false });

    const extra = Array.from({ length: 101 }, (_, i) => `id-${1100 + i}`);
    // A genuine appended batch alerts and forces eviction of the oldest ids.
    assert.equal(tracker.observe([...base, ...extra], { atLiveEdge: false }), true);

    // Replaying an evicted id through the live path stays silent.
    assert.equal(
      tracker.observe([{ id: 'id-0', origin: 'live' }, ...base.slice(1), ...extra], { atLiveEdge: false }),
      false,
    );

    // An evicted id replayed without provenance is also silent.
    assert.equal(tracker.observe([...base, ...extra], { atLiveEdge: false }), false);

    // A genuinely new live id still alerts.
    assert.equal(
      tracker.observe([...base, ...extra, { id: 'brand-new', origin: 'live' }], { atLiveEdge: false }),
      true,
    );
  });

  it('keeps history paging silent after eviction', () => {
    const tracker = createCrowdArrivalTracker();
    const base = Array.from({ length: 1100 }, (_, i) => `id-${i}`);
    tracker.observe(base, { atLiveEdge: false });
    assert.equal(
      tracker.observe([{ id: 'id-0', origin: 'history' }, ...base], { atLiveEdge: false }),
      false,
    );
  });
});
