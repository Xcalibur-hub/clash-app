/** Crowd arrival detection: IDs, not timestamps. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCrowdArrivalTracker } from './crowdArrivals.ts';

describe('crowd arrivals', () => {
  it('never alerts on initial hydration, even away from the edge', () => {
    const tracker = createCrowdArrivalTracker();
    assert.equal(tracker.observe(['a', 'b'], { source: 'hydrate', atLiveEdge: false }), false);
  });

  it('detects a late arrival whose timestamp ordering is old', () => {
    const tracker = createCrowdArrivalTracker();
    tracker.observe(['m2', 'm3'], { source: 'hydrate', atLiveEdge: false });
    // m1 arrives late and is older by timestamp, but it is a new ID.
    assert.equal(tracker.observe(['m1', 'm2', 'm3'], { source: 'live', atLiveEdge: false }), true);
  });

  it('detects equal-timestamp arrivals with a lower id', () => {
    const tracker = createCrowdArrivalTracker();
    tracker.observe(['b', 'c'], { source: 'hydrate', atLiveEdge: false });
    assert.equal(tracker.observe(['a', 'b', 'c'], { source: 'live', atLiveEdge: false }), true);
  });

  it('does not alert while the reader is at the live edge', () => {
    const tracker = createCrowdArrivalTracker();
    tracker.observe(['a'], { source: 'hydrate', atLiveEdge: true });
    assert.equal(tracker.observe(['a', 'b'], { source: 'live', atLiveEdge: true }), false);
  });

  it('never alerts for paginated history', () => {
    const tracker = createCrowdArrivalTracker();
    tracker.observe(['m5'], { atLiveEdge: false });
    assert.equal(tracker.observe(['m3', 'm4', 'm5'], { atLiveEdge: false }), true,
      'plain ids remain live by contract');
    tracker.reset();
    tracker.observe(['m5'], { atLiveEdge: false });
    assert.equal(
      tracker.observe([{ id: 'm3', origin: 'history' }, { id: 'm4', origin: 'history' }, 'm5'], { atLiveEdge: false }),
      false,
    );
    // The older rows are now known and cannot alert later.
    assert.equal(tracker.observe(['m3', 'm4', 'm5'], { atLiveEdge: false }), false);
  });

  it('alerts for a live row that sorts before the window', () => {
    const tracker = createCrowdArrivalTracker();
    tracker.observe(['m2', 'm3'], { atLiveEdge: false });
    assert.equal(
      tracker.observe([{ id: 'm1', origin: 'live' }, 'm2', 'm3'], { atLiveEdge: false }),
      true,
    );
  });

  it('ignores moderation removals and reconciliation replays', () => {
    const tracker = createCrowdArrivalTracker();
    tracker.observe(['a', 'b', 'c'], { source: 'hydrate', atLiveEdge: false });
    assert.equal(tracker.observe(['a', 'c'], { source: 'live', atLiveEdge: false }), false);
    assert.equal(tracker.observe(['a', 'c'], { source: 'live', atLiveEdge: false }), false);
  });

  it('re-hydrates after a room change without alerting', () => {
    const tracker = createCrowdArrivalTracker();
    tracker.observe(['a', 'b'], { source: 'hydrate', atLiveEdge: false });
    tracker.reset();
    assert.equal(tracker.observe(['x', 'y'], { source: 'hydrate', atLiveEdge: false }), false);
  });

  it('stays bounded while remembering replays', () => {
    const tracker = createCrowdArrivalTracker();
    const first = Array.from({ length: 600 }, (_, i) => `id-${i}`);
    tracker.observe(first, { source: 'hydrate', atLiveEdge: false });
    const second = Array.from({ length: 600 }, (_, i) => `id-${600 + i}`);
    assert.equal(tracker.observe([...first, ...second], { source: 'live', atLiveEdge: false }), true);
    assert.equal(tracker.observe([...first, ...second], { source: 'live', atLiveEdge: false }), false);
  });
});
