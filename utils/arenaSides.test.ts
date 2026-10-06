import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { arenaSideTone, arenaSidesForTheme } from '../theme/arenaSides.ts';
import { lightTheme, darkTheme } from '../theme/palettes.ts';

describe('arena side identity', () => {
  it('keeps Side A and Side B distinct without neon clash', () => {
    const light = arenaSidesForTheme(lightTheme);
    const dark = arenaSidesForTheme(darkTheme);
    assert.equal(light.a.label, 'SIDE A');
    assert.equal(light.b.label, 'SIDE B');
    assert.equal(light.a.stanceLabel, 'Agree');
    assert.equal(light.b.stanceLabel, 'Disagree');
    assert.notEqual(light.a.ink, light.b.ink);
    assert.notEqual(dark.a.ink, dark.b.ink);
    assert.equal(arenaSideTone('A', 'light').key, 'A');
  });
});
