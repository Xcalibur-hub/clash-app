/** Next-Clash eligibility guards — existing discovery data only. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextClashStillAvailable, selectNextClash } from './nextClash.ts';
import type { ClashDiscoveryEntry } from './arenaClashDiscovery';
import type { ArenaRoom } from '../services/liveArenaService';

const entry = (overrides: Partial<ClashDiscoveryEntry> = {}): ClashDiscoveryEntry => ({
  id: 'clash-2',
  takeId: 'take-2',
  roomId: 'room-2',
  title: 'Second clash',
  status: 'open',
  state: 'LIVE',
  kind: 'CLASH',
  ...overrides,
});

const room = (overrides: Partial<ArenaRoom> = {}): ArenaRoom =>
  ({ roomId: 'room-2', clashId: 'clash-2', roomMode: 'DUEL', phase: 'open', duel: { status: 'open' }, ...overrides } as ArenaRoom);

describe('next Clash selection', () => {
  it('skips the Clash just watched', () => {
    assert.equal(selectNextClash([entry({ id: 'current', roomId: 'room-1' }), entry()], 'current')?.id, 'clash-2');
  });

  it('returns the first eligible live clash in server order', () => {
    const rows = [entry({ id: 'a', roomId: 'ra' }), entry({ id: 'b', roomId: 'rb' })];
    assert.equal(selectNextClash(rows, 'current')?.id, 'a');
  });

  it('rejects terminal, upcoming, pending and roomless entries', () => {
    const rows = [
      entry({ id: 'settled', status: 'settled', state: 'COMPLETED' }),
      entry({ id: 'cancelled', status: 'cancelled', state: 'COMPLETED' }),
      entry({ id: 'upcoming', state: 'UPCOMING' }),
      entry({ id: 'pending', kind: 'CHALLENGE', state: 'PENDING', status: 'PENDING', roomId: null }),
      entry({ id: 'roomless', roomId: null }),
    ];
    assert.equal(selectNextClash(rows, 'current'), null);
  });

  it('returns null when only the current Clash is live', () => {
    assert.equal(selectNextClash([entry({ id: 'current', roomId: 'room-1' })], 'current'), null);
    assert.equal(selectNextClash([], 'current'), null);
  });
});

describe('next Clash revalidation', () => {
  it('accepts a room that is still the same open duel', () => {
    assert.equal(nextClashStillAvailable(entry(), room()), true);
    assert.equal(nextClashStillAvailable(entry(), room({ phase: 'final_arguments' })), true);
  });

  it('refuses a settled, closed or judging room', () => {
    assert.equal(nextClashStillAvailable(entry(), room({ duel: { status: 'settled' } as ArenaRoom['duel'] })), false);
    assert.equal(nextClashStillAvailable(entry(), room({ phase: 'closed' })), false);
    assert.equal(nextClashStillAvailable(entry(), room({ phase: 'judging' })), false);
  });

  it('refuses identity drift, group rooms and missing rooms', () => {
    assert.equal(nextClashStillAvailable(entry(), room({ clashId: 'other' })), false);
    assert.equal(nextClashStillAvailable(entry(), room({ roomId: 'other' })), false);
    assert.equal(nextClashStillAvailable(entry(), room({ roomMode: 'GROUP', duel: null })), false);
    assert.equal(nextClashStillAvailable(entry(), null), false);
  });

  it('refuses an entry without a room', () => {
    assert.equal(nextClashStillAvailable(entry({ roomId: null }), room()), false);
  });
});
