const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Mirrors the current-UTC-day partition check in partition-verifier.cjs.
 * Pure so the structure rules are testable without a database.
 */
function assertPartitionStructure(catalog) {
  const day = (n) => new Date(n + 'T00:00:00Z');
  const name = (d) => 'messages_' + d.toISOString().slice(0, 10).replaceAll('-', '_');

  const today = day(catalog.utcDay);
  const todayName = name(today);
  const leaf = catalog.relations.find((x) => x.name === todayName);

  assert.ok(leaf, 'Current UTC day partition ' + todayName + ' must exist');
  assert.equal(leaf.kind, 'r');
  assert.ok(
    Array.isArray(leaf.parents) && leaf.parents.length === 1
      && leaf.parents[0].schema === 'realtime' && leaf.parents[0].name === 'messages',
    'Current UTC day partition must be attached to realtime.messages',
  );
  const next = new Date(+today + 86400000).toISOString().slice(0, 10);
  assert.equal(
    leaf.bound,
    `FOR VALUES FROM ('${catalog.utcDay} 00:00:00') TO ('${next} 00:00:00')`,
    'Current UTC day partition must cover exactly its UTC day',
  );
}

const bound = (d) => {
  const t = new Date(d + 'T00:00:00Z');
  const n = new Date(+t + 86400000).toISOString().slice(0, 10);
  return `FOR VALUES FROM ('${d} 00:00:00') TO ('${n} 00:00:00')`;
};
const leaf = (d, over = {}) => ({
  name: 'messages_' + d.replaceAll('-', '_'),
  kind: 'r',
  bound: bound(d),
  parents: [{ schema: 'realtime', name: 'messages' }],
  ...over,
});

const catalog = (over = {}) => ({
  utcDay: '2026-11-07',
  relations: [leaf('2026-11-06'), leaf('2026-11-07'), leaf('2026-11-08'), ...(over.relations || [])],
  ...over,
});

test('a valid current-day partition passes', () => {
  assert.doesNotThrow(() => assertPartitionStructure(catalog()));
});

test('a missing current-day partition fails', () => {
  const c = catalog({ relations: [leaf('2026-11-06'), leaf('2026-11-08')] });
  assert.throws(() => assertPartitionStructure(c), /must exist/);
});

test('a detached partition fails', () => {
  const c = catalog();
  c.relations[1] = leaf('2026-11-07', { parents: [] });
  assert.throws(() => assertPartitionStructure(c), /attached to realtime.messages/);
});

test('a partition attached to the wrong parent fails', () => {
  const c = catalog();
  c.relations[1] = leaf('2026-11-07', { parents: [{ schema: 'public', name: 'messages' }] });
  assert.throws(() => assertPartitionStructure(c), /attached to realtime.messages/);
});

test('an incorrectly bounded partition fails', () => {
  const c = catalog();
  c.relations[1] = leaf('2026-11-07', { bound: bound('2026-11-06') });
  assert.throws(() => assertPartitionStructure(c), /cover exactly its UTC day/);
});

test('a non-table relation fails', () => {
  const c = catalog();
  c.relations[1] = leaf('2026-11-07', { kind: 'v' });
  assert.throws(() => assertPartitionStructure(c), /actual|expected/i);
});

test('no log evidence is required for the current day', () => {
  // The guard must not depend on a "Creating partitions" log line.
  const c = catalog();
  assert.equal(c.logObservations, undefined);
  assert.doesNotThrow(() => assertPartitionStructure(c));
});
