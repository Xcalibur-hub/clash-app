/**
 * Offline tests for the staging fixture lifecycle (Phase 11 Step 16A).
 * MOCKED SQL RUNNER: nothing here connects to a database or the network.
 * Run: node --test scripts/staging-fixtures.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STAGING_HOST } from './staging-function-e2e.mjs';
import {
  AUTHORIZATION_TOKENS, COUNT_COLUMNS, EVIDENCE_FILES, MAX_FIXTURE_COUNTS, PREFIX_RE, assertScoped,
  authorizeFixtureAction, buildCountSql, buildFixtureSql, countsWithinCeilings, ids, parseCounts, runFixtureAction,
} from './staging-fixtures.mjs';

const PREFIX = 'p11f_abcd1234';
const REF = STAGING_HOST.split('.')[0];
const baseEnv = (over = {}) => ({
  STAGING_SUPABASE_URL: `https://${STAGING_HOST}`,
  STAGING_FIXTURE_PREFIX: PREFIX,
  STAGING_FIXTURES_CREATE_AUTHORIZATION: AUTHORIZATION_TOKENS.create,
  STAGING_FIXTURES_EXECUTE_AUTHORIZATION: AUTHORIZATION_TOKENS.execute,
  STAGING_FIXTURES_CLEANUP_AUTHORIZATION: AUTHORIZATION_TOKENS.cleanup,
  ...over,
});

/** A runner that records every statement and can be told to fail at a given write index. */
function recordingRunner({ failAt = null, counts = {} } = {}) {
  const seen = [];
  return {
    seen,
    run: async (sql) => {
      seen.push(sql);
      if (/^\s*select/i.test(sql)) return { ...Object.fromEntries(COUNT_COLUMNS.map((k) => [k, 0])), ...counts };
      if (seen.filter((s) => !/^\s*select/i.test(s)).length === failAt) throw new Error('simulated failure');
      return {};
    },
  };
}

test('fixture ids are deterministic, prefix-validated and match the profile derivation', () => {
  const a = ids(PREFIX);
  assert.deepEqual(a, ids(PREFIX), 'the same prefix must always yield the same ids');
  assert.notDeepEqual(ids('p11f_zzzz9999').dropId, a.dropId);
  assert.match(a.accountA.profileId, /^u_[0-9a-f]{32}$/, 'profile id mirrors handle_new_user');
  assert.match(a.accountA.uid, /^[0-9a-f-]{36}$/, 'auth uid must be a uuid');
  assert.ok(a.storagePath.startsWith(`${PREFIX}/`), 'storage path is namespaced by prefix');
  assert.ok(a.lessonSecret.includes(PREFIX));
  assert.equal(PREFIX_RE.test('bad prefix'), false);
  assert.equal(PREFIX_RE.test('p11f_ABCD1234'), false, 'uppercase is rejected');
  assert.throws(() => ids('nope'), /prefix must match/);
});

test('every fixture authorization is separate and fails closed', () => {
  for (const action of ['create', 'execute', 'cleanup']) {
    assert.equal(authorizeFixtureAction(action, baseEnv()).ok, true, action);
    assert.equal(authorizeFixtureAction(action, baseEnv({ [`STAGING_FIXTURES_${action.toUpperCase()}_AUTHORIZATION`]: '' })).ok, false);
    assert.equal(authorizeFixtureAction(action, baseEnv({ STAGING_SUPABASE_URL: 'https://other.supabase.co' })).ok, false);
    assert.equal(authorizeFixtureAction(action, baseEnv({ STAGING_FIXTURE_PREFIX: 'nope' })).ok, false);
  }
  // One action's token never authorizes another action.
  assert.equal(authorizeFixtureAction('create', baseEnv({ STAGING_FIXTURES_CREATE_AUTHORIZATION: AUTHORIZATION_TOKENS.cleanup })).ok, false);
  assert.equal(authorizeFixtureAction('cleanup', baseEnv({ STAGING_FIXTURES_CLEANUP_AUTHORIZATION: AUTHORIZATION_TOKENS.execute })).ok, false);
  assert.match(authorizeFixtureAction('create', {}).reason, /REFUSING/);
  assert.throws(() => authorizeFixtureAction('drop_everything', baseEnv()), /unknown fixture action/);
});


test('setup statements are idempotent and never delete anything', () => {
  const { setup } = buildFixtureSql(PREFIX);
  assert.ok(setup.length >= 12, 'the proposed write set is explicit and enumerated');
  for (const sql of setup) {
    assert.equal(/\bdelete\b/i.test(sql), false, `setup must not delete: ${sql.slice(0, 60)}`);
    if (/^\s*insert/i.test(sql)) {
      assert.ok(/on conflict(\s*\([^)]*\))?\s*do nothing|where not exists/i.test(sql), `insert must be idempotent: ${sql.slice(0, 60)}`);
    }
  }
  assert.ok(setup.some((s) => s.includes(`'${PREFIX}_drop'`)), 'the drop id is prefix-scoped');
  assert.ok(setup.some((s) => s.includes("crypt(:'fixture_password'")), 'the password is a psql variable, never a literal');
  assert.equal(setup.some((s) => /test-password/.test(s)), false, 'no credential literal in the SQL');
});

test('teardown covers every table the setup touches and is bounded by run ids', () => {
  const { setup, teardown } = buildFixtureSql(PREFIX);
  const tables = (list) => new Set(list.flatMap((s) => [...s.matchAll(/(?:insert into|delete from|update)\s+([a-z_.]+)/gi)].map((m) => m[1])));
  const deleted = tables(teardown);
  for (const t of tables(setup)) {
    if (t === 'auth.users') continue;
    assert.ok(deleted.has(t), `${t} is written but never cleaned up`);
  }
  for (const sql of teardown) {
    assert.match(sql, /^\s*delete from/i, 'teardown deletes only');
    assert.ok(/where/i.test(sql), `delete must be filtered: ${sql.slice(0, 60)}`);
  }
  // Idempotent: the same statements run again, and every one is a filtered DELETE.
  assert.deepEqual(buildFixtureSql(PREFIX).teardown, teardown);
});

test('assertScoped refuses unscoped and unbounded writes', () => {
  assert.throws(() => assertScoped([`delete from public.vault_drops where id = 'someone-elses'`], PREFIX), /unscoped write/);
  assert.throws(() => assertScoped([`delete from public.vault_drops`], PREFIX), /unbounded DELETE/);
  assert.throws(() => assertScoped([`update public.profiles set name = 'x'`], PREFIX), /unscoped write/);
  assert.doesNotThrow(() => assertScoped(buildFixtureSql(PREFIX).teardown, PREFIX));
});

test('counts are parsed in the exact column order the query emits', () => {
  const row = COUNT_COLUMNS.map((k) => (k === 'auth_users' ? 2 : k === 'vault_drops' ? 1 : 0)).join('|');
  const parsed = parseCounts(`${row}\n`);
  assert.equal(parsed.auth_users, 2);
  assert.equal(parsed.vault_drops, 1);
  assert.equal(Object.keys(parsed).length, COUNT_COLUMNS.length);
  assert.deepEqual(parseCounts('garbage'), {}, 'an unparsable row is treated as unknown');
  const query = buildCountSql(PREFIX);
  assert.equal((query.match(/as [a-z_]+/g) ?? []).length, COUNT_COLUMNS.length, 'query and parser must agree on the column set');
  assert.ok(query.includes(PREFIX), 'the count query is prefix-scoped');
  assert.equal(countsWithinCeilings({ auth_users: 2, vault_drops: 1 }).ok, true);
  const over = countsWithinCeilings({ auth_users: 3, profiles: 2 });
  assert.equal(over.ok, false);
  assert.match(over.over.join(','), /auth_users=3 > 2/);
  assert.equal(MAX_FIXTURE_COUNTS.digital_creator_sessions, 1);
});


test('create stops before any write when the database state is unexpected', async () => {
  const runner = recordingRunner({ counts: { auth_users: 3 } });
  const res = await runFixtureAction({ action: 'create', env: baseEnv(), runSql: runner.run });
  assert.equal(res.ok, false);
  assert.equal(res.stopped, true);
  assert.match(res.reason, /unexpected database state/);
  assert.equal(res.executed, 0);
  assert.equal(runner.seen.length, 1, 'only the pre-flight count was sent');
  assert.match(runner.seen[0], /^\s*select/i);
});

test('a partial setup failure stops, reports where, and deletes nothing', async () => {
  const runner = recordingRunner({ failAt: 4 });
  const res = await runFixtureAction({ action: 'create', env: baseEnv(), runSql: runner.run });
  assert.equal(res.ok, false);
  assert.equal(res.executed, 3);
  assert.equal(res.failed_statement_index, 3);
  assert.equal(res.cleanup_available, true);
  assert.equal(res.evidence_preserved, true);
  assert.equal(runner.seen.some((s) => /^\s*delete/i.test(s)), false, 'a failure must never trigger automatic cleanup');
  assert.equal(res.manifest.prefix, PREFIX, 'the manifest still identifies what to clean up');
});

test('create and teardown run every statement and each needs its own authorization', async () => {
  const created = recordingRunner();
  const okCreate = await runFixtureAction({ action: 'create', env: baseEnv(), runSql: created.run });
  assert.equal(okCreate.ok, true);
  assert.equal(okCreate.executed, buildFixtureSql(PREFIX).setup.length);

  const torn = recordingRunner();
  const okTeardown = await runFixtureAction({ action: 'teardown', env: baseEnv(), runSql: torn.run });
  assert.equal(okTeardown.ok, true);
  assert.equal(okTeardown.executed, buildFixtureSql(PREFIX).teardown.length);
  assert.equal(torn.seen.every((s) => /^\s*delete/i.test(s)), true, 'teardown sends only filtered deletes');

  // The create token cannot run a teardown, and vice versa.
  const blocked = recordingRunner();
  const noAuth = await runFixtureAction({ action: 'teardown', env: baseEnv({ STAGING_FIXTURES_CLEANUP_AUTHORIZATION: '' }), runSql: blocked.run });
  assert.equal(noAuth.ok, false);
  assert.equal(noAuth.stopped, true);
  assert.equal(blocked.seen.length, 0, 'an unauthorized teardown sends nothing');
  const createBlocked = recordingRunner();
  const res = await runFixtureAction({ action: 'create', env: baseEnv({ STAGING_FIXTURES_CREATE_AUTHORIZATION: '' }), runSql: createBlocked.run });
  assert.equal(res.stopped, true);
  assert.equal(createBlocked.seen.length, 0);
});

test('evidence may only be purged from an explicit, fixed list', () => {
  assert.deepEqual(EVIDENCE_FILES, ['fixture-create-evidence.json', 'fixture-teardown-evidence.json', 'e2e-evidence.json']);
  assert.equal(EVIDENCE_FILES.every((f) => !f.includes('/') && !f.includes('..')), true);
});
