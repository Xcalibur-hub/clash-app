import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseProfileClashStats,
  withClashStats,
  type ProfileClashStats,
} from './profileClashStats.ts';
import type { User } from '../store/types.ts';

const baseUser: User = {
  id: 'u1',
  handle: 'alice',
  name: 'Alice',
  tint: '#111',
  hood: 'techtakes',
  rank: 'Rookie',
  reputation: 10,
  coins: 0,
  clashes: null,
  wins: null,
  streak: 0,
  badges: [],
};

describe('parseProfileClashStats', () => {
  it('parses a verified empty record (no completed clashes)', () => {
    assert.deepEqual(parseProfileClashStats({ clashes: 0, wins: 0, losses: 0, draws: 0 }), {
      clashes: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    });
  });

  it('parses one settled win', () => {
    assert.deepEqual(parseProfileClashStats({ clashes: 1, wins: 1, losses: 0, draws: 0 }), {
      clashes: 1,
      wins: 1,
      losses: 0,
      draws: 0,
    });
  });

  it('parses settled loss and draw', () => {
    assert.deepEqual(parseProfileClashStats({ clashes: 2, wins: 0, losses: 1, draws: 1 }), {
      clashes: 2,
      wins: 0,
      losses: 1,
      draws: 1,
    });
  });

  it('parses multiple completed clashes', () => {
    const stats: ProfileClashStats = { clashes: 5, wins: 2, losses: 2, draws: 1 };
    assert.deepEqual(parseProfileClashStats(stats), stats);
  });

  it('rejects malformed payloads instead of inventing zeros', () => {
    assert.equal(parseProfileClashStats(null), null);
    assert.equal(parseProfileClashStats(undefined), null);
    assert.equal(parseProfileClashStats({}), null);
    assert.equal(parseProfileClashStats({ clashes: 1, wins: 1 }), null);
    assert.equal(parseProfileClashStats({ clashes: -1, wins: 0, losses: 0, draws: 0 }), null);
    assert.equal(parseProfileClashStats({ clashes: '1', wins: 0, losses: 0, draws: 0 }), null);
  });
});

describe('withClashStats', () => {
  it('hydrates null clash fields without inventing values on the base user', () => {
    assert.equal(baseUser.wins, null);
    assert.equal(baseUser.clashes, null);
    const next = withClashStats(baseUser, { clashes: 3, wins: 1, losses: 1, draws: 1 });
    assert.equal(next.clashes, 3);
    assert.equal(next.wins, 1);
    assert.equal(baseUser.wins, null);
  });

  it('keeps participant-specific wins separate from clash participation totals', () => {
    const next = withClashStats(baseUser, { clashes: 4, wins: 1, losses: 2, draws: 1 });
    assert.ok(next.wins !== null && next.clashes !== null);
    assert.ok(next.wins < next.clashes);
  });
});
