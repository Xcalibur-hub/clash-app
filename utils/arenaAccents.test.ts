/**
 * Unit checks for Arena accent tokens — presentation only.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  arenaAccentForHood,
  arenaAccentPalette,
  battleMomentAccent,
  pulseAccent,
  trendRaceLineAccent,
} from '../theme/arenaAccents.ts';

describe('arena accent palette', () => {
  it('exposes the six restrained keys in both themes', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const table = arenaAccentPalette(scheme);
      assert.deepEqual(Object.keys(table).sort(), [
        'amber',
        'blue',
        'coral',
        'rose',
        'teal',
        'violet',
      ]);
      for (const accent of Object.values(table)) {
        assert.ok(accent.ink.startsWith('#'));
        assert.ok(accent.soft.startsWith('rgba'));
        assert.ok(accent.deep.startsWith('rgba'));
      }
    }
  });

  it('maps hoods to stable accents', () => {
    assert.equal(arenaAccentForHood('techtakes', 'light').key, 'blue');
    assert.equal(arenaAccentForHood('football', 'dark').key, 'teal');
    assert.equal(arenaAccentForHood('movies', 'light').key, 'violet');
  });
});

describe('trend race accents', () => {
  it('gives #1/#2/#3 distinct colors', () => {
    const a = trendRaceLineAccent({
      rank: 1,
      selected: false,
      topicId: 'a',
      scheme: 'light',
    });
    const b = trendRaceLineAccent({
      rank: 2,
      selected: false,
      topicId: 'b',
      scheme: 'light',
    });
    const c = trendRaceLineAccent({
      rank: 3,
      selected: false,
      topicId: 'c',
      scheme: 'light',
    });
    assert.equal(a?.key, 'coral');
    assert.equal(b?.key, 'blue');
    assert.equal(c?.key, 'violet');
    assert.notEqual(a!.ink, b!.ink);
    assert.notEqual(b!.ink, c!.ink);
  });

  it('keeps #4–#10 muted until selected', () => {
    assert.equal(
      trendRaceLineAccent({
        rank: 7,
        selected: false,
        topicId: 'quiet',
        scheme: 'dark',
      }),
      null,
    );
    const selected = trendRaceLineAccent({
      rank: 7,
      selected: true,
      topicId: 'quiet',
      scheme: 'dark',
    });
    assert.ok(selected);
    assert.ok(selected.ink.length > 0);
  });
});

describe('moment + pulse accents', () => {
  it('maps semantic moments without stock red/green', () => {
    assert.equal(battleMomentAccent('FAST_RISING', 'light').key, 'coral');
    assert.equal(battleMomentAccent('BACKUP', 'light').key, 'blue');
    assert.equal(battleMomentAccent('BEST_EVIDENCE', 'light').key, 'teal');
    assert.equal(battleMomentAccent('CROWD_FAVORITE', 'light').key, 'rose');
    assert.equal(battleMomentAccent('JUDGING', 'light').key, 'violet');
    assert.equal(battleMomentAccent('CLASH', 'light').key, 'amber');
  });

  it('maps pulse badges', () => {
    assert.equal(pulseAccent('rising', 'light')?.key, 'coral');
    assert.equal(pulseAccent('hot', 'light')?.key, 'amber');
    assert.equal(pulseAccent('clash', 'light')?.key, 'rose');
    assert.equal(pulseAccent(null, 'light'), null);
  });
});
