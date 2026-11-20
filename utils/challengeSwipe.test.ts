import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHALLENGE_SWIPE_RATIO,
  challengeSwipeDecision,
  challengeSwipeProgress,
} from './challengeSwipe.ts';

test('swipe right past threshold accepts', () => {
  assert.equal(challengeSwipeDecision(200, 0, 360), 'accept');
  assert.equal(challengeSwipeDecision(360 * CHALLENGE_SWIPE_RATIO + 1, 0, 360), 'accept');
});

test('swipe left past threshold passes', () => {
  assert.equal(challengeSwipeDecision(-200, 0, 360), 'pass');
});

test('insufficient drag springs back', () => {
  assert.equal(challengeSwipeDecision(20, 0, 360), null);
  assert.equal(challengeSwipeDecision(-20, 50, 360), null);
});

test('fast velocity can commit without full travel', () => {
  assert.equal(challengeSwipeDecision(40, 1200, 360), 'accept');
  assert.equal(challengeSwipeDecision(-40, -1200, 360), 'pass');
});

test('invalid geometry never commits', () => {
  assert.equal(challengeSwipeDecision(200, 0, 0), null);
  assert.equal(challengeSwipeDecision(NaN, 0, 360), null);
});

test('progress is clamped 0–1', () => {
  assert.equal(challengeSwipeProgress(0, 360), 0);
  assert.ok(challengeSwipeProgress(360 * CHALLENGE_SWIPE_RATIO, 360) === 1);
  assert.equal(challengeSwipeProgress(9999, 360), 1);
});
