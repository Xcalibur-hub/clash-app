import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArenaChallenge, challengeCanAct, validCounterPosition } from './arenaChallengePayload.ts';
const fixture = () => ({ id: 'ch', takeId: 't', challengerId: 'b', challengedId: 'a', counterPosition: 'A meaningful counter-position.',
  status: 'PENDING', createdAt: '2026-10-07T10:00:00Z', expiresAt: '2026-10-07T12:00:00Z', resolvedAt: null,
  clashId: null as string | null, roomId: null as string | null, created: true, challenger: { id: 'b', name: 'B', handle: 'b' } });
test('pending Challenge preserves source, counter and server identities', () => {
  const ch = parseArenaChallenge(fixture()); assert.equal(ch.challenger.id, 'b'); assert.equal(ch.counterPosition, fixture().counterPosition);
});
test('accepted Challenge requires both canonical links', () => {
  const p = { ...fixture(), status: 'ACCEPTED', resolvedAt: '2026-10-07T10:01:00Z', clashId: 'c', roomId: 'r' };
  assert.equal(parseArenaChallenge(p).roomId, 'r'); assert.throws(() => parseArenaChallenge({ ...p, roomId: null }));
});
test('terminal non-accepted states cannot carry a battle', () => {
  for (const status of ['PASSED','CANCELLED','EXPIRED']) {
    assert.equal(parseArenaChallenge({ ...fixture(), status, resolvedAt: '2026-10-07T10:01:00Z' }).status, status);
    assert.throws(() => parseArenaChallenge({ ...fixture(), status, resolvedAt: '2026-10-07T10:01:00Z', clashId: 'c', roomId: 'r' }));
  }
});
test('expiry removes actions without fabricating acceptance', () => {
  const ch = parseArenaChallenge(fixture());
  assert.equal(challengeCanAct(ch, Date.parse(ch.expiresAt) - 1), true);
  assert.equal(challengeCanAct(ch, Date.parse(ch.expiresAt)), false);
  assert.equal(ch.status, 'PENDING');
});
test('forged identity, unknown status and malformed clock fail closed', () => {
  for (const bad of [{ challengedId: 'b' }, { challenger: { id: 'x', name: 'X', handle: 'x' } }, { status: 'WINNER' }, { expiresAt: 'bad' }, { expiresAt: '2026-10-07T09:00:00Z' }, { status: 'ACCEPTED', clashId: 'c', roomId: 'r' }, { created: 'true' }]) {
    assert.throws(() => parseArenaChallenge({ ...fixture(), ...bad }));
  }
});
test('counter-position bounds count Unicode characters and reject empty spam', () => {
  assert.equal(validCounterPosition('fight me'), false); assert.equal(validCounterPosition(' '.repeat(40)), false);
  assert.equal(validCounterPosition('!'.repeat(20)), false); assert.equal(validCounterPosition('a'.repeat(501)), false);
  assert.equal(validCounterPosition('A counter: ' + '😀'.repeat(489)), true);
});
