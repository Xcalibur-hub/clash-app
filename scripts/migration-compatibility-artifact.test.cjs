const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { frozenScan } = require('./migration-encoding-check.cjs');
const { prepare, generate, verify } = require('./migration-compatibility-artifact.cjs');
const files = frozenScan().files;
function scratch(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clash-compat-'));
  try { fn(root); } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('clash-compat-'));
    fs.rmSync(root, { recursive: true });
  }
}
test('106 outputs deterministic with exactly three BOM removals and one correction', () => {
  const a = prepare(); const b = prepare();
  assert.deepEqual(a, b);
  assert.equal(a.outputs.length, 106);
  assert.equal(a.manifest.files.filter(f => f.source_sha256 !== f.artifact_sha256).length, 3);
  assert.equal(a.manifest.files.flatMap(f => f.transformations).length, 4);
  assert.equal(a.manifest.files.filter(f => f.transformations.some(t => t.kind === 'assert-managed-pgcrypto')).length, 1);
});
test('altered ordinary source bytes refused before output creation', () => scratch(root => {
  const altered = files.map((f,i) => i ? f : {...f, bytes: Buffer.concat([f.bytes, Buffer.from('\n')])});
  assert.throws(() => generate(root, path.join(root, 'migration-compatibility-test'), altered), /Source bytes changed/);
  assert.deepEqual(fs.readdirSync(root), []);
}));
test('unexpected extension statement refused', () => {
  const altered = files.map((f,i) => i === 50 ? {...f, bytes: Buffer.concat([f.bytes, Buffer.from('\ncreate extension evil;')])} : f);
  assert.throws(() => prepare(altered), /Source bytes changed/);
});
test('source reorder and missing migration refused', () => {
  assert.throws(() => prepare([...files].reverse()), /Source order/);
  assert.throws(() => prepare(files.slice(1)));
});
test('unsafe paths and existing directories refused', () => scratch(root => {
  for (const destination of [root, path.join(root, '..', 'migration-compatibility-outside'), path.join(root, 'nested', 'migration-compatibility-test'), path.join(root, 'bad-name')])
    assert.throws(() => generate(root, destination));
  const target = path.join(root, 'migration-compatibility-test');
  fs.mkdirSync(target);
  assert.throws(() => generate(root, target), /exists/);
  assert.deepEqual(fs.readdirSync(target), []);
}));
test('full artifact verifies and detects corruption, extras and manifest tampering', () => scratch(root => {
  const target = path.join(root, 'migration-compatibility-test');
  generate(root, target);
  const p = prepare(); verify(target, p);
  const file = path.join(target, 'migrations', p.outputs[0].name);
  fs.appendFileSync(file, 'x'); assert.throws(() => verify(target, p));
  fs.writeFileSync(file, p.outputs[0].bytes);
  const extra = path.join(target, 'migrations', 'extra.sql');
  fs.writeFileSync(extra, ''); assert.throws(() => verify(target, p)); fs.unlinkSync(extra);
  fs.writeFileSync(path.join(target, 'compatibility-manifest.json'), '{}');
  assert.throws(() => verify(target, p));
  assert.throws(() => generate(root, target), /exists/);
}));
