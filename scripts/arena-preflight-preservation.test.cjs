const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Mirrors the historical-preservation assertions in execution-preflight.cjs L12.
 * Kept as a pure function so the rules are testable without a database.
 */
const IMMUTABLE = ['take', 'clash', 'room', 'topic', 'participants', 'messages', 'receipts', 'ballots', 'verdicts', 'rewards', 'profiles'];

function assertPreserved(original, saved) {
  // 1. Every immutable fixture component must be byte-identical.
  for (const k of IMMUTABLE) assert.deepEqual(original[k], saved[k], k);
  // 2. Every ORIGINAL notification must still exist by id and be unchanged.
  for (const n of saved.notifications) {
    assert.deepEqual(original.notifications.find((x) => x.id === n.id), n, 'notification ' + n.id);
  }
  // 3. Counts may grow with additional fixtures, but never shrink.
  for (const k of Object.keys(saved.counts)) {
    assert.ok(original.counts[k] >= saved.counts[k], 'count ' + k + ' decreased');
  }
}

const base = () => ({
  take: { id: 'take_6fb7', status: 'expired' },
  clash: { id: 'cl_35eb', status: 'settled' },
  room: { id: 'ar_f8c0', status: 'closed' },
  topic: { id: 'at_1', status: 'live' },
  participants: [{ id: 'p1' }, { id: 'p2' }],
  messages: [{ id: 'm1', body: 'hi' }],
  receipts: [{ id: 'r1' }],
  ballots: [{ id: 'b1', side: 'A' }],
  verdicts: [{ id: 'v1', winner: 'DRAW' }],
  rewards: [{ id: 'w1', rep: 120 }],
  profiles: [{ id: 'u1', rep: 500 }],
  notifications: [{ id: 'n1', kind: 'challenge_received' }, { id: 'n2', kind: 'challenge_accepted' }],
  counts: { takes: 1, challenges: 1, clashes: 1, rooms: 1 },
});

test('unchanged fixture passes', () => {
  const saved = base();
  assert.doesNotThrow(() => assertPreserved(structuredClone(saved), saved));
});

test('additional notifications are allowed', () => {
  const saved = base();
  const live = structuredClone(saved);
  live.notifications.push({ id: 'a_new', kind: 'challenge_accepted' }, { id: 'a_new2', kind: 'challenge_received' });
  assert.doesNotThrow(() => assertPreserved(live, saved));
});

test('a missing original notification fails', () => {
  const saved = base();
  const live = structuredClone(saved);
  live.notifications = live.notifications.filter((n) => n.id !== 'n2');
  assert.throws(() => assertPreserved(live, saved), /notification n2/);
});

test('a modified original notification fails', () => {
  const saved = base();
  const live = structuredClone(saved);
  live.notifications[0] = { ...live.notifications[0], kind: 'tampered' };
  assert.throws(() => assertPreserved(live, saved), /notification n1/);
});

test('increased counts are allowed', () => {
  const saved = base();
  const live = structuredClone(saved);
  live.counts = { takes: 2, challenges: 2, clashes: 2, rooms: 2 };
  assert.doesNotThrow(() => assertPreserved(live, saved));
});

test('a decreased count fails', () => {
  const saved = base();
  const live = structuredClone(saved);
  live.counts = { ...live.counts, clashes: 0 };
  assert.throws(() => assertPreserved(live, saved), /count clashes decreased/);
});

test('every tracked count is verified independently', () => {
  const saved = base();
  for (const key of Object.keys(saved.counts)) {
    const live = structuredClone(saved);
    live.counts[key] = saved.counts[key] - 1;
    assert.throws(() => assertPreserved(live, saved), new RegExp('count ' + key + ' decreased'), key);
  }
});

test('changes to immutable fixture data still fail', () => {
  for (const key of IMMUTABLE) {
    const saved = base();
    const live = structuredClone(saved);
    live[key] = [{ id: 'changed' }];
    assert.throws(() => assertPreserved(live, saved), undefined, key);
  }
});

test('a settled DRAW verdict cannot be altered', () => {
  const saved = base();
  const live = structuredClone(saved);
  live.verdicts[0].winner = 'A';
  assert.throws(() => assertPreserved(live, saved), /verdicts/);
});
