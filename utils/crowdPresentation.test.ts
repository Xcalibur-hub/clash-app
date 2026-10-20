/**
 * Crowd presentation guards — honest labels, deterministic scroll decisions.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  crowdAtLiveEdge,
  crowdAudienceLabel,
  crowdTimeLabel,
  crowdUnseenAfterArrival,
} from './crowdPresentation.ts';

const NOW = Date.parse('2026-10-19T12:00:00.000Z');
const at = (secondsAgo: number): string => new Date(NOW - secondsAgo * 1000).toISOString();

describe('crowd presentation', () => {
  it('labels recent rows without inventing precision', () => {
    assert.equal(crowdTimeLabel(at(0), NOW), 'now');
    assert.equal(crowdTimeLabel(at(30), NOW), 'now');
    assert.equal(crowdTimeLabel(at(60), NOW), '1m');
    assert.equal(crowdTimeLabel(at(150), NOW), '2m');
    assert.equal(crowdTimeLabel(at(7_200), NOW), '2h');
    assert.equal(crowdTimeLabel(at(259_200), NOW), '3d');
  });

  it('renders nothing for an unparseable timestamp or clock', () => {
    assert.equal(crowdTimeLabel('not-a-date', NOW), '');
    assert.equal(crowdTimeLabel(at(0), Number.NaN), '');
  });

  it('never presents future skew as a negative age', () => {
    assert.equal(crowdTimeLabel(new Date(NOW + 60_000).toISOString(), NOW), 'now');
  });

  it('claims spectators only from a server spectator count', () => {
    assert.equal(crowdAudienceLabel({ spectatorCount: 0 }), '0 spectators');
    assert.equal(crowdAudienceLabel({ spectatorCount: 1 }), '1 spectator');
    assert.equal(crowdAudienceLabel({ spectatorCount: 12 }), '12 spectators');
  });

  it('falls back to membership wording instead of inventing viewers', () => {
    assert.equal(crowdAudienceLabel({ participantCount: 4 }), '4 joined');
    assert.equal(crowdAudienceLabel({ spectatorCount: null, participantCount: 9 }), '9 joined');
    assert.equal(crowdAudienceLabel({}), null);
    assert.equal(crowdAudienceLabel({ spectatorCount: -1, participantCount: -2 }), null);
    assert.equal(crowdAudienceLabel({ spectatorCount: Number.NaN }), null);
  });

  it('treats the live edge as a threshold, not an exact pixel', () => {
    assert.equal(crowdAtLiveEdge({ offsetY: 600, layoutHeight: 400, contentHeight: 1000 }), true);
    assert.equal(crowdAtLiveEdge({ offsetY: 570, layoutHeight: 400, contentHeight: 1000 }), true);
    assert.equal(crowdAtLiveEdge({ offsetY: 200, layoutHeight: 400, contentHeight: 1000 }), false);
    // Exactly on the threshold counts as the edge; one pixel away does not.
    assert.equal(crowdAtLiveEdge({ offsetY: 561, layoutHeight: 400, contentHeight: 1000, threshold: 39 }), true);
    assert.equal(crowdAtLiveEdge({ offsetY: 560, layoutHeight: 400, contentHeight: 1000, threshold: 39 }), false);
  });

  it('assumes the live edge when layout is not measured yet', () => {
    assert.equal(crowdAtLiveEdge({ offsetY: Number.NaN, layoutHeight: 0, contentHeight: 0 }), true);
  });

  it('surfaces arrivals only while the reader is away from the edge', () => {
    assert.equal(crowdUnseenAfterArrival({ atLiveEdge: false, latestChanged: true, unseen: false }), true);
    assert.equal(crowdUnseenAfterArrival({ atLiveEdge: false, latestChanged: false, unseen: true }), true);
    assert.equal(crowdUnseenAfterArrival({ atLiveEdge: false, latestChanged: false, unseen: false }), false);
    assert.equal(crowdUnseenAfterArrival({ atLiveEdge: true, latestChanged: true, unseen: true }), false);
  });
});
