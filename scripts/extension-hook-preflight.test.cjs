const test = require('node:test');
const assert = require('node:assert/strict');
const { frozenScan, normalize } = require('./migration-encoding-check.cjs');
const { preflight, proposedPatch, TARGET, BEFORE, AFTER } = require('./extension-hook-preflight.cjs');
const bytes = frozenScan().files.find(f => f.path === TARGET).bytes;
test('all frozen source hashes verified; four extension statements; none after 44', () => {
  const report = preflight();
  assert.equal(report.migration_count, 106);
  assert.equal(report.operations.length, 4);
  assert.equal(report.remaining_extension_ddl, 0);
  assert.equal(report.sql_executed, false);
});
test('proposal changes exactly the reviewed statement after BOM removal', () => {
  const original = Buffer.from(bytes);
  const { result, offset } = proposedPatch(bytes);
  const normalized = normalize(bytes);
  assert.deepEqual(result.subarray(0, offset), normalized.subarray(0, offset));
  assert.deepEqual(result.subarray(offset + Buffer.byteLength(AFTER)), normalized.subarray(offset + Buffer.byteLength(BEFORE)));
  assert.deepEqual(bytes, original);
  assert.doesNotMatch(AFTER, /create extension|grant |alter role|security definer/i);
  assert.match(AFTER, /raise exception/);
});
test('unreviewed source bytes fail closed', () => {
  assert.throws(() => proposedPatch(Buffer.concat([bytes, Buffer.from('\n')])), /Unreviewed/);
});
