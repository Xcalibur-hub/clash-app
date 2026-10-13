const test = require('node:test');
const assert = require('node:assert/strict');
const { frozenScan } = require('./migration-encoding-check.cjs');
const { prepare } = require('./migration-compatibility-artifact.cjs');
const { pgcryptoArtifactAssertPasses, APPROVED_PGCRYPTO_OWNERS, AFTER, TARGET } = require('./extension-hook-preflight.cjs');
const fs = require('node:fs');
const path = require('node:path');

test('postgres and supabase_admin owners accepted', () => {
  for (const owner of APPROVED_PGCRYPTO_OWNERS) {
    assert.ok(pgcryptoArtifactAssertPasses({ extname: 'pgcrypto', extversion: '1.3', schema: 'extensions', owner }));
  }
});

test('other owners rejected', () => {
  for (const owner of ['', 'anon', 'authenticated', 'service_role', 'nobody', 'supabase_auth_admin']) {
    assert.equal(pgcryptoArtifactAssertPasses({ extname: 'pgcrypto', extversion: '1.3', schema: 'extensions', owner }), false);
  }
});

test('wrong version or schema or missing extension rejected', () => {
  assert.equal(pgcryptoArtifactAssertPasses({ extname: 'pgcrypto', extversion: '1.2', schema: 'extensions', owner: 'postgres' }), false);
  assert.equal(pgcryptoArtifactAssertPasses({ extname: 'pgcrypto', extversion: '1.3', schema: 'public', owner: 'postgres' }), false);
  assert.equal(pgcryptoArtifactAssertPasses({ extname: 'postgis', extversion: '1.3', schema: 'extensions', owner: 'postgres' }), false);
  assert.equal(pgcryptoArtifactAssertPasses({ extname: 'pgcrypto', extversion: '1.3', schema: 'extensions', owner: 'postgres' }), true);
});

test('artifact SQL uses exact approved owner allowlist', () => {
  assert.match(AFTER, /rolname in \('postgres', 'supabase_admin'\)/);
  assert.doesNotMatch(AFTER, /rolname\s*=\s*'supabase_admin'/);
});

test('exactly one assert-managed-pgcrypto transformation', () => {
  const { manifest } = prepare();
  assert.equal(manifest.files.filter(f => f.transformations.some(t => t.kind === 'assert-managed-pgcrypto')).length, 1);
  assert.equal(manifest.files.find(f => f.path === TARGET).artifact_sha256, '380b693fd09edcefbe30028c8ed5de72ae9716776198f1d45c6ed8a1ef17f261');
});

test('first 43 artifact hashes unchanged vs hosted-committed lineage', () => {
  const legacyPath = path.join(__dirname, '../docs/evidence/phase-11-6m/legacy-compatibility-manifest-snapshot.json');
  assert.ok(fs.existsSync(legacyPath), 'legacy snapshot required');
  const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
  const { manifest } = prepare();
  assert.equal(manifest.files.length, 106);
  for (let i = 0; i < 43; i++) {
    assert.equal(manifest.files[i].artifact_sha256, legacy.files[i].artifact_sha256, manifest.files[i].path);
  }
  assert.notEqual(manifest.files[43].artifact_sha256, legacy.files[43].artifact_sha256);
});

test('106 migration source hashes unchanged; 245-file integration bundle unchanged', () => {
  const { report } = frozenScan();
  assert.equal(report.migration_count, 106);
  assert.equal(report.blocking_issue_count, 0);
  assert.equal(report.manifest_git_blob_sha256, 'a9b30736c87a7fac05c9764404dfd58a876f64db6a3e072e9a348cac8b162b4e');
  const { frozen } = require('../tools/isolated-supabase/prepare.cjs');
  assert.equal(frozen().files.length, 245);
});
