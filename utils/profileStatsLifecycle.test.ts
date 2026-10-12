import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterSettledWins,
  isCurrentRequest,
  ownedStateIsStale,
} from './profileStatsLifecycle.ts';

describe('isCurrentRequest', () => {
  it('accepts the latest in-flight response while the screen is active', () => {
    assert.equal(isCurrentRequest(true, 3, 3), true);
  });

  it('rejects cancelled or superseded responses', () => {
    assert.equal(isCurrentRequest(false, 3, 3), false);
    assert.equal(isCurrentRequest(true, 2, 3), false);
  });
});

describe('ownedStateIsStale', () => {
  it('treats missing load ownership as stale during account switch', () => {
    assert.equal(ownedStateIsStale(null, 'user-b'), true);
    assert.equal(ownedStateIsStale(undefined, 'user-b'), true);
  });

  it('detects previous-account Wins/facets while a new account is loading', () => {
    assert.equal(ownedStateIsStale('user-a', 'user-b'), true);
    assert.equal(ownedStateIsStale('user-b', 'user-b'), false);
  });
});

describe('filterSettledWins', () => {
  it('keeps only authoritative won outcomes', () => {
    const rows = [
      { id: '1', outcome: 'won' as const },
      { id: '2', outcome: 'lost' as const },
      { id: '3', outcome: 'draw' as const },
      { id: '4', outcome: null },
    ];
    assert.deepEqual(
      filterSettledWins(rows).map((row) => row.id),
      ['1'],
    );
  });
});
