import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { isWorldNativeMapAvailable } from './worldNativeMapAvailability.ts';

const originalFlag = process.env.EXPO_PUBLIC_WORLD_NATIVE_MAP_ANDROID;

describe('isWorldNativeMapAvailable', () => {
  afterEach(() => {
    if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_WORLD_NATIVE_MAP_ANDROID;
    else process.env.EXPO_PUBLIC_WORLD_NATIVE_MAP_ANDROID = originalFlag;
  });

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_WORLD_NATIVE_MAP_ANDROID;
  });

  it('allows native map on iOS without the Android rebuild flag', () => {
    assert.equal(isWorldNativeMapAvailable('ios'), true);
  });

  it('blocks Android MapView until the rebuild opt-in is set', () => {
    assert.equal(isWorldNativeMapAvailable('android'), false);
  });

  it('allows Android MapView only for explicit rebuild opt-in values', () => {
    for (const value of ['1', 'true', 'YES', ' True ']) {
      process.env.EXPO_PUBLIC_WORLD_NATIVE_MAP_ANDROID = value;
      assert.equal(isWorldNativeMapAvailable('android'), true, value);
    }
    process.env.EXPO_PUBLIC_WORLD_NATIVE_MAP_ANDROID = '0';
    assert.equal(isWorldNativeMapAvailable('android'), false);
  });

  it('never claims MapView on non-mobile platforms', () => {
    process.env.EXPO_PUBLIC_WORLD_NATIVE_MAP_ANDROID = '1';
    assert.equal(isWorldNativeMapAvailable('web'), false);
  });
});
