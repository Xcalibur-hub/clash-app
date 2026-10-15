import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DECORATIVE_MOTION_ENV,
  DECORATIVE_MOTION_FROZEN,
  decorativeMotionFrozen,
} from './decorativeMotion.ts';

describe('decorative motion freeze flag', () => {
  it('is off by default in a development build', () => {
    assert.equal(decorativeMotionFrozen({ isDev: true, flag: undefined }), false);
    assert.equal(decorativeMotionFrozen({ isDev: true, flag: null }), false);
    assert.equal(decorativeMotionFrozen({ isDev: true, flag: '' }), false);
  });

  it('freezes only when a development build sets the flag to exactly 1', () => {
    assert.equal(decorativeMotionFrozen({ isDev: true, flag: '1' }), true);
    assert.equal(decorativeMotionFrozen({ isDev: true, flag: ' 1' }), false);
    assert.equal(decorativeMotionFrozen({ isDev: true, flag: '0' }), false);
    assert.equal(decorativeMotionFrozen({ isDev: true, flag: 'true' }), false);
    assert.equal(decorativeMotionFrozen({ isDev: true, flag: '01' }), false);
  });

  it('never freezes a production build, even with the flag set', () => {
    assert.equal(decorativeMotionFrozen({ isDev: false, flag: '1' }), false);
    assert.equal(decorativeMotionFrozen({ isDev: false, flag: undefined }), false);
  });

  it('exposes the reviewed environment variable name', () => {
    assert.equal(DECORATIVE_MOTION_ENV, 'EXPO_PUBLIC_ARENA_DISABLE_DECORATIVE_MOTION');
  });

  it('resolves to off outside a development build (this test process)', () => {
    // `__DEV__` does not exist under node: the production rule must hold.
    assert.equal(DECORATIVE_MOTION_FROZEN, false);
  });
});
