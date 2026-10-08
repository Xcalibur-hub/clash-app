import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ARENA_MODES,
  DEFAULT_ARENA_MODE,
  arenaModeAccessibilityLabel,
  isArenaMode,
} from './arenaNav.ts';

describe('arena navigation', () => {
  it('defaults to For You', () => {
    assert.equal(DEFAULT_ARENA_MODE, 'for_you');
  });

  it('exposes exactly four Arena destinations', () => {
    assert.deepEqual(
      ARENA_MODES.map((m) => m.id),
      ['for_you', 'clashes', 'community', 'topics'],
    );
    assert.deepEqual(
      ARENA_MODES.map((m) => m.label),
      ['Home', 'Live Clashes', 'Communities', 'Topics & Trends'],
    );
  });

  it('labels selection for accessibility', () => {
    assert.equal(arenaModeAccessibilityLabel('FOR YOU', true), 'FOR YOU, selected');
    assert.equal(arenaModeAccessibilityLabel('CLASHES', false), 'CLASHES');
  });

  it('guards unknown mode ids', () => {
    assert.equal(isArenaMode('for_you'), true);
    assert.equal(isArenaMode('explore'), false);
  });
});
