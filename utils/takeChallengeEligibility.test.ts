import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DUEL_WINDOW_MS, takeChallengeIneligibility } from './takeChallengeEligibility.ts';
import type { Take } from '../store/types.ts';
const take = (expiresAt: number, extra: Partial<Take> = {}): Take => ({ id: 't', authorId: 'a', text: 'Take', hood: 'techtakes', createdAt: 0, expiresAt, reactions: 0, clashes: 0, status: 'active', ...extra });

test('canonical creation needs strictly more than 30 minutes, including the exact boundary', () => {
  assert.equal(takeChallengeIneligibility(take(100 + DUEL_WINDOW_MS + 1), 100), null);
  assert.equal(takeChallengeIneligibility(take(100 + DUEL_WINDOW_MS), 100), 'duel_window');
  assert.equal(takeChallengeIneligibility(take(100 + DUEL_WINDOW_MS - 1), 100), 'duel_window');
});
test('expiry and inactive status are independent reasons', () => {
  assert.equal(takeChallengeIneligibility(take(100), 100), 'archived');
  assert.equal(takeChallengeIneligibility(take(99), 100), 'archived');
  assert.equal(takeChallengeIneligibility(take(Infinity), 100), 'unavailable');
  assert.equal(takeChallengeIneligibility(take(4e6, { status: 'expired' }), 100), 'archived');
  assert.equal(takeChallengeIneligibility(take(4e6, { status: 'removed' }), 100), 'unavailable');
  assert.equal(takeChallengeIneligibility(null, 100), 'unavailable');
});
test('runtime fixtures cannot create canonical challenges', () => {
  assert.equal(takeChallengeIneligibility(take(4e6, { isRuntimeFixture: true }), 100), 'unavailable');
});
test('legacy starts retain their actual shorter remaining-time rule', () => {
  assert.equal(takeChallengeIneligibility(take(101), 100, true), null);
  assert.equal(takeChallengeIneligibility(take(100), 100, true), 'archived');
});
