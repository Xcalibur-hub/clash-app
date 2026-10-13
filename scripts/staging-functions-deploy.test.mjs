/**
 * Offline regression tests for the staging deployment tooling (Phase 11 Step 13).
 * No network, no CLI, no hosted access: every check is exercised directly.
 * Run: node --test scripts/staging-functions-deploy.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildEvidence, checkCliVersion, checkCommitPin, checkInventory, checkPartialDeployment, checkProjectRef,
  checkSecretPrereqs, checkJwtEquals, checkSmoke, containsSecretLike, evidenceIsSanitized, redact,
  requiredSecretsForSet, selectFunctions,
} from './staging-functions.lib.mjs';
import { APPROVED_DEPLOYMENT_SET, FUNCTIONS, PINNED_CLI_VERSION, PROJECT_REF } from './staging-functions.manifest.mjs';
import { run, validateRepositoryInputs } from './staging-functions-deploy.mjs';
import { normalizeApiInventory } from './staging-functions.api.mjs';

const SHA = 'a'.repeat(40);
const deployed = (name, verify_jwt) => ({ name, verify_jwt, version: 1 });

test('commit pinning: missing pin, dirty tree, mismatch all fail; exact match passes', () => {
  assert.equal(checkCommitPin({ expected: '', actual: SHA, clean: true }).ok, false);
  assert.equal(checkCommitPin({ expected: SHA, actual: SHA, clean: false, dirtyPaths: ['x'] }).ok, false);
  assert.equal(checkCommitPin({ expected: SHA, actual: 'b'.repeat(40), clean: true }).ok, false);
  assert.equal(checkCommitPin({ expected: SHA, actual: SHA, clean: true }).ok, true);
});

test('clean-tree check reports the offending path count', () => {
  const r = checkCommitPin({ expected: SHA, actual: SHA, clean: false, dirtyPaths: ['a', 'b', 'c'] });
  assert.match(r.reason, /3 path/);
});

test('project-reference enforcement rejects a wrong or unconfirmed ref', () => {
  assert.equal(checkProjectRef('otherref', 'otherref').ok, false);
  assert.equal(checkProjectRef(PROJECT_REF, '').ok, false);
  assert.equal(checkProjectRef(PROJECT_REF, PROJECT_REF).ok, true);
});

test('function allowlisting: unknown and unapproved names are refused', () => {
  assert.equal(selectFunctions({ requested: ['nope'], approved: APPROVED_DEPLOYMENT_SET, manifest: FUNCTIONS }).ok, false);
  for (const pending of ['arena-editorial', 'arena-gifs']) {
    const r = selectFunctions({ requested: [pending], approved: APPROVED_DEPLOYMENT_SET, manifest: FUNCTIONS });
    assert.equal(r.ok, false, `${pending} must not be in the first deployment set`);
  }
  const ok = selectFunctions({ requested: APPROVED_DEPLOYMENT_SET, approved: APPROVED_DEPLOYMENT_SET, manifest: FUNCTIONS });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.selected, APPROVED_DEPLOYMENT_SET);
});

test('JWT enforcement fails closed on null, undefined, string or mismatch', () => {
  assert.equal(checkJwtEquals(null, true, 'f').ok, false);
  assert.equal(checkJwtEquals(undefined, true, 'f').ok, false);
  assert.equal(checkJwtEquals('true', true, 'f').ok, false);
  assert.equal(checkJwtEquals(false, true, 'f').ok, false);
  assert.equal(checkJwtEquals(true, true, 'f').ok, true);
});

test('inventory verification fails on null verify_jwt and on unexpected functions', () => {
  const allTrue = FUNCTIONS.map((f) => deployed(f.name, f.verifyJwt));
  assert.equal(checkInventory({ manifest: FUNCTIONS, actual: allTrue }).ok, true);
  const nullJwt = allTrue.map((r) => (r.name === 'creator-ai' ? { ...r, verify_jwt: null } : r));
  assert.equal(checkInventory({ manifest: FUNCTIONS, actual: nullJwt }).ok, false);
  const extra = [...allTrue, deployed('rogue-function', true)];
  assert.equal(checkInventory({ manifest: FUNCTIONS, actual: extra }).ok, false);
  assert.equal(checkInventory({ manifest: FUNCTIONS, actual: extra, allowlist: ['rogue-function'] }).ok, true);
});

test('secret prerequisites are scoped to the selected set only', () => {
  assert.deepEqual(requiredSecretsForSet(APPROVED_DEPLOYMENT_SET, FUNCTIONS), []);
  assert.deepEqual(requiredSecretsForSet(['arena-editorial'], FUNCTIONS), ['ARENA_EDITORIAL_RUN_SECRET']);
  assert.deepEqual(requiredSecretsForSet(['arena-gifs'], FUNCTIONS), []);
  assert.equal(checkSecretPrereqs({ required: ['ARENA_EDITORIAL_RUN_SECRET'], present: [] }).ok, false);
  assert.equal(checkSecretPrereqs({ required: [], present: [] }).ok, true);
});

test('partial deployment is detected', () => {
  assert.equal(checkPartialDeployment({ requested: APPROVED_DEPLOYMENT_SET, actual: [deployed('vault-media-access', true)] }).ok, false);
  assert.equal(checkPartialDeployment({ requested: ['vault-media-access'], actual: [deployed('vault-media-access', true)] }).ok, true);
});

test('negative-authentication verification requires 401 for every function', () => {
  assert.equal(checkSmoke([{ name: 'a', status: 401 }]).ok, true);
  assert.equal(checkSmoke([{ name: 'a', status: 200 }]).ok, false);
  assert.equal(checkSmoke([{ name: 'a', status: 'error' }]).ok, false);
  assert.equal(checkSmoke([]).ok, false);
});

test('pinned CLI version mismatch is refused', () => {
  assert.equal(checkCliVersion(PINNED_CLI_VERSION, PINNED_CLI_VERSION).ok, true);
  assert.equal(checkCliVersion('supabase 2.120.0', PINNED_CLI_VERSION).ok, false);
});

test('evidence is sanitized: tokens, JWTs and Bearer headers are redacted', () => {
  const token = 'sbp_' + 'a1b2c3d4e5f6g7h8i9j0';
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl';
  assert.equal(redact(`failed with ${token}`).includes(token), false);
  assert.equal(redact(`auth ${jwt}`).includes(jwt), false);
  assert.match(redact('Authorization: Bearer abc123def456ghi'), /\[REDACTED\]/);
  assert.equal(containsSecretLike('nothing here'), false);
  assert.equal(containsSecretLike(`x ${token}`), true);
  assert.equal(evidenceIsSanitized({ a: ['ok', { b: 'fine' }] }), true);
  assert.equal(evidenceIsSanitized({ a: jwt }), false);
  const ev = buildEvidence({ mode: 'plan', commit: SHA, branch: 'b', projectRef: PROJECT_REF, selected: APPROVED_DEPLOYMENT_SET, manifest: FUNCTIONS });
  assert.equal(evidenceIsSanitized(ev), true);
  assert.equal(ev.secrets_read, false);
  assert.equal(ev.secret_values_present, false);
});

test('repository inputs match the manifest and every function file exists', () => {
  validateRepositoryInputs(FUNCTIONS);
});

test('plan mode never deploys and refuses an unapproved function', async () => {
  const pending = await run(['--only', 'arena-editorial', '--evidence-dir', '.expo/staging-deploy/test-pending']);
  assert.equal(pending.result, 'STOPPED');
  assert.match(pending.reason, /approved deployment set/);

  const plan = await run(['--only', APPROVED_DEPLOYMENT_SET.join(','), '--evidence-dir', '.expo/staging-deploy/test-plan']);
  assert.match(plan.result, /^PLAN ONLY/);
  assert.equal(plan.deployed, undefined);
  assert.deepEqual(plan.approved_set, APPROVED_DEPLOYMENT_SET);
});

test('an execute run without --commit or --confirm-project stops before any CLI call', async () => {
  const stopped = await run(['--only', 'vault-media-access', '--execute', '--evidence-dir', '.expo/staging-deploy/test-noauth']);
  assert.equal(stopped.result, 'STOPPED');
  assert.ok(stopped.reason.length > 0);
});

test('Management API inventory normalizer handles empty, shaped and malformed payloads', () => {
  assert.deepEqual(normalizeApiInventory([]), []);
  const [row] = normalizeApiInventory([{ slug: 'creator-ai', version: 3, verify_jwt: true, updated_at: 'x' }]);
  assert.deepEqual(row, { name: 'creator-ai', verify_jwt: true, version: 3, updated_at: 'x' });
  // A missing verify_jwt must become null so the strict check fails closed.
  assert.equal(normalizeApiInventory([{ slug: 'x' }])[0].verify_jwt, null);
  assert.throws(() => normalizeApiInventory({ message: 'not an array' }));
});

test('an empty deployed inventory fails closed when the expected set is required', () => {
  assert.equal(checkInventory({ manifest: FUNCTIONS, actual: [], requireAll: true }).ok, false);
  assert.equal(checkInventory({ manifest: FUNCTIONS, actual: [] }).ok, true); // no unexpected, no mismatch — membership is a separate gate
  assert.equal(checkPartialDeployment({ requested: APPROVED_DEPLOYMENT_SET, actual: [] }).ok, false);
  const partialSet = APPROVED_DEPLOYMENT_SET.slice(0, 2).map((n) => ({ name: n, verify_jwt: true, version: 1 }));
  assert.equal(checkInventory({ manifest: FUNCTIONS.filter((f) => APPROVED_DEPLOYMENT_SET.includes(f.name)), actual: partialSet, requireAll: true }).ok, false);
});

