/** One-shot motion registry guards. */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { hasPlayed, resetPlayedOnce, shouldPlayOnce } from './motionOnce.ts';

describe('one-shot motion', () => {
  beforeEach(() => resetPlayedOnce());

  it('plays a key exactly once', () => {
    assert.equal(shouldPlayOnce('entrance:clash-1'), true);
    assert.equal(shouldPlayOnce('entrance:clash-1'), false);
    assert.equal(hasPlayed('entrance:clash-1'), true);
  });

  it('keeps distinct moments independent', () => {
    assert.equal(shouldPlayOnce('entrance:clash-1'), true);
    assert.equal(shouldPlayOnce('entrance:clash-2'), true);
    assert.equal(shouldPlayOnce('verdict:clash-1:settled:SPLIT DECISION'), true);
  });

  it('ignores an empty key', () => {
    assert.equal(shouldPlayOnce(''), false);
  });

  it('never replays a verdict haptic for the same canonical moment', () => {
    const key = 'haptic:clash-9:settled:UNANIMOUS';
    assert.equal(shouldPlayOnce(key), true);
    for (let visit = 0; visit < 3; visit += 1) assert.equal(shouldPlayOnce(key), false);
  });
});
