import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_ARENA_MODE } from './arenaNav.ts';
import {
  ARENA_HYDRATION_TIMEOUT_MS,
  arenaFlatListData,
  isArenaFeedMode,
  shouldShowArenaFeedEmpty,
} from './arenaFeedSurface.ts';

describe('Arena For You feed surface', () => {
  it('defaults Arena mode to For You', () => {
    assert.equal(DEFAULT_ARENA_MODE, 'for_you');
    assert.equal(isArenaFeedMode('for_you'), true);
    assert.equal(isArenaFeedMode('clashes'), false);
  });

  it('renders eligible list rows only in For You when ready', () => {
    const rows = [{ id: 't1' }, { id: 't2' }];
    assert.deepEqual(arenaFlatListData('for_you', 'ready', rows), rows);
    assert.deepEqual(arenaFlatListData('clashes', 'ready', rows), []);
  });

  it('clears rows while loading or errored so status UI can show', () => {
    const rows = [{ id: 't1' }];
    assert.deepEqual(arenaFlatListData('for_you', 'loading', rows), []);
    assert.deepEqual(arenaFlatListData('for_you', 'error', rows), []);
  });

  it('restores For You rows after leaving Clashes (mode switch)', () => {
    const rows = [{ id: 'a' }];
    assert.deepEqual(arenaFlatListData('clashes', 'ready', rows), []);
    assert.deepEqual(arenaFlatListData('for_you', 'ready', rows), rows);
  });

  it('does not show a false empty state when Fresh Takes already has items', () => {
    // listFeed may be [] because Fresh Takes consumed the first slice.
    assert.equal(shouldShowArenaFeedEmpty('for_you', 'ready', 3), false);
    assert.equal(shouldShowArenaFeedEmpty('for_you', 'ready', 0), true);
  });

  it('shows empty slot for loading and failed fetch', () => {
    assert.equal(shouldShowArenaFeedEmpty('for_you', 'loading', 0), true);
    assert.equal(shouldShowArenaFeedEmpty('for_you', 'error', 0), true);
    assert.equal(shouldShowArenaFeedEmpty('topics', 'error', 0), false);
  });

  it('bounds hydration so a hung local Supabase cannot spin forever', () => {
    assert.ok(ARENA_HYDRATION_TIMEOUT_MS >= 8_000);
    assert.ok(ARENA_HYDRATION_TIMEOUT_MS <= 20_000);
  });
});
