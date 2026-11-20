import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  focusCountryCode,
  projectCountry,
  rotationToward,
  wrapRotation,
} from './exploreGlobeMath.ts';

describe('exploreGlobeMath', () => {
  it('marks front hemisphere visible', () => {
    const front = projectCountry(0, 0, 0, 100);
    assert.equal(front.visible, true);
    const back = projectCountry(0, 180, 0, 100);
    assert.equal(back.visible, false);
  });

  it('focuses the nearest front country', () => {
    const code = focusCountryCode(78.96, [
      { code: 'IN', lat: 20.59, lng: 78.96 },
      { code: 'US', lat: 37.09, lng: -95.71 },
    ]);
    assert.equal(code, 'IN');
  });

  it('wraps rotation', () => {
    assert.equal(wrapRotation(190), -170);
    assert.equal(rotationToward(138.25), 138.25);
  });
});
