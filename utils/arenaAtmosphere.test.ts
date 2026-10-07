import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  atmospherePalette,
  duelAtmosphereMood,
  topicAtmosphereMood,
} from './arenaAtmosphere.ts';
import type { ArenaDuel } from './arenaDuelPayload.ts';

const duel = (): ArenaDuel => ({
  clashId: 'cl',
  status: 'open',
  fighterA: { id: 'a', name: 'Kevin', handle: 'kevin' },
  fighterB: { id: 'b', name: 'Rohan', handle: 'rohan' },
  viewerRelationship: 'spectator',
  mayJudge: false,
  hasJudged: false,
  verdict: null,
});

test('atmosphere palettes exist for every mood', () => {
  for (const mood of ['discovery', 'upcoming', 'live', 'judging', 'verdict', 'cancelled'] as const) {
    const palette = atmospherePalette(mood);
    assert.equal(palette.blobs.length, 4);
    assert.ok(palette.tempo > 0);
    assert.ok(palette.intensity > 0 && palette.intensity <= 1);
  }
});

test('duel atmosphere never uses verdict tallies to pick mood', () => {
  assert.equal(duelAtmosphereMood(duel(), 'open'), 'live');
  assert.equal(duelAtmosphereMood(duel(), 'scheduled'), 'upcoming');
  assert.equal(duelAtmosphereMood(duel(), 'judging'), 'judging');
  assert.equal(duelAtmosphereMood(duel(), 'closed'), 'judging');
  assert.equal(
    duelAtmosphereMood({ ...duel(), status: 'cancelled' }, 'open'),
    'cancelled',
  );
  assert.equal(
    duelAtmosphereMood({
      ...duel(),
      status: 'settled',
      verdict: { winnerSide: 'A', jurySize: 3, verdictLabel: 'A', sideAScore: 3, sideBScore: 0 },
    }, 'open'),
    'verdict',
  );
});

test('topic atmosphere maps truthful status/phase only', () => {
  assert.equal(topicAtmosphereMood('live', 'open'), 'live');
  assert.equal(topicAtmosphereMood('scheduled', 'scheduled'), 'upcoming');
  assert.equal(topicAtmosphereMood('live', 'judging'), 'judging');
  assert.equal(topicAtmosphereMood('closed', 'closed'), 'judging');
});
