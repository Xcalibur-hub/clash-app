/**
 * Offline tests for the staging fixture lifecycle (Phase 11 Step 16A.1).
 * MOCKED HTTP and a MOCKED SQL RUNNER: nothing here connects to a database or the network.
 * One test exists per corrected failure condition from the 16A review.
 * Run: node --test scripts/staging-fixtures.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { STAGING_HOST, redactForEvidence } from './staging-host.mjs';
import {
  AUTHORIZATION_TOKENS, CLAIMS, COUNT_COLUMNS, CREDENTIAL_ENV, EVIDENCE_FILES, MAX_FIXTURE_COUNTS,
  PREFIX_RE, assertScoped, authorizeFixtureAction, buildCountSql, buildFixtureSql, buildIdentitySql,
  buildResolveSql, buildTeardownSql, credentialPlan, ids, parseCounts, parseResolved, provisionAccounts,
  redactSecrets, runFixtureAction, signInProbe, validateCounts, verifyAfterCreate, createPsqlRunner,
} from './staging-fixtures.mjs';

const PREFIX = 'p11f_abcd1234';
const MODULE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'staging-fixtures.mjs');
const DB_SECRET = 'db-connection-secret-1';
const USER_SECRET = 'fixture-user-secret-2';
const baseEnv = (over = {}) => ({
  STAGING_SUPABASE_URL: `https://${STAGING_HOST}`,
  STAGING_FIXTURE_PREFIX: PREFIX,
  STAGING_FIXTURES_CREATE_AUTHORIZATION: AUTHORIZATION_TOKENS.create,
  STAGING_FIXTURES_EXECUTE_AUTHORIZATION: AUTHORIZATION_TOKENS.execute,
  STAGING_FIXTURES_CLEANUP_AUTHORIZATION: AUTHORIZATION_TOKENS.cleanup,
  [CREDENTIAL_ENV.dbPassword]: DB_SECRET,
  [CREDENTIAL_ENV.fixtureUserPassword]: USER_SECRET,
  [CREDENTIAL_ENV.dbCa]: 'C:/ca.pem',
  STAGING_DB_TARGET: STAGING_HOST.split('.')[0],
  STAGING_ANON_KEY: 'public-anon-key',
  STAGING_SERVICE_ROLE_KEY: 'service-role-key-for-mocks',
  ...over,
});

/** Full inventory row for our prefix, with every column tunable. */
const inventory = (over = {}) => {
  const base = Object.fromEntries(COUNT_COLUMNS.map((k) => [k, 0]));
  const order = COUNT_COLUMNS.map((k) => String(base[k] + (over[k] ?? 0)));
  return order.join('|');
};

/** A runner that records statements and can fail at a given write index or inventory. */
function recordingRunner({ failWriteAt = null, rows = null, row = null } = {}) {
  const seen = [];
  const sequence = rows ?? [row ?? inventory()];
  let selects = 0;
  let writes = 0;
  return {
    seen,
    run: async (sql) => {
      seen.push(sql);
      if (/^\s*select/i.test(sql)) {
        const value = sequence[Math.min(selects, sequence.length - 1)];
        selects += 1;
        return value;
      }
      writes += 1;
      if (writes === failWriteAt) throw new Error('simulated failure');
      return '';
    },
  };
}

/** Mock HTTP for the Auth Admin API and the sign-in probe. */
function mockAuth({ alreadyExists = false, wrongUid = false, signInStatus = 200 } = {}) {
  const calls = [];
  const uids = { a: ids(PREFIX).accountA.uid, b: ids(PREFIX).accountB.uid };
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body, headers: init.headers ?? {} });
    const json = (status, body) => ({ status, text: async () => JSON.stringify(body) });
    if (url.endsWith('/auth/v1/admin/users') && init.method === 'POST') {
      if (alreadyExists) return json(422, { msg: 'user already registered' });
      const email = JSON.parse(init.body).email;
      return json(200, { id: email.includes('.a@') ? uids.a : uids.b });
    }
    if (url.includes('/auth/v1/admin/users?page=')) {
      return json(200, { users: [{ id: uids.a, email: ids(PREFIX).accountA.email }, { id: uids.b, email: ids(PREFIX).accountB.email }] });
    }
    if (url.includes('/auth/v1/admin/users/') && init.method === 'DELETE') return json(200, {});
    if (url.includes('/auth/v1/token')) {
      const email = JSON.parse(init.body).email;
      const uid = email.includes('.a@') ? uids.a : uids.b;
      if (signInStatus !== 200) return json(signInStatus, { error: 'invalid_grant' });
      return json(200, { access_token: 'jwt-for-probe', user: { id: wrongUid ? 'aaaaaaaa-0000-0000-0000-000000000000' : uid } });
    }
    return json(404, { error: 'not_found' });
  };
  return { fetchImpl, calls, uids };
}


// ── Finding 1: connection credentials are separate from fixture-user credentials ───────────
test('the two credential kinds are separate and both are required', () => {
  assert.equal(credentialPlan(baseEnv()).ok, true);
  assert.equal(credentialPlan(baseEnv()).separated, true);
  const noDb = credentialPlan(baseEnv({ [CREDENTIAL_ENV.dbPassword]: '' }));
  assert.equal(noDb.ok, false);
  assert.match(noDb.reasons.join('|'), /STAGING_DB_PASSWORD/);
  const noUser = credentialPlan(baseEnv({ [CREDENTIAL_ENV.fixtureUserPassword]: '' }));
  assert.equal(noUser.ok, false);
  assert.match(noUser.reasons.join('|'), /STAGING_FIXTURE_USER_PASSWORD/);
  const noCa = credentialPlan(baseEnv({ [CREDENTIAL_ENV.dbCa]: '' }));
  assert.equal(noCa.ok, false);
  assert.match(noCa.reasons.join('|'), /STAGING_DB_CA_PATH/);
  // Reusing one secret for both purposes is refused rather than silently accepted.
  const same = credentialPlan(baseEnv({ [CREDENTIAL_ENV.fixtureUserPassword]: DB_SECRET }));
  assert.equal(same.ok, false);
  assert.equal(same.separated, false);
  assert.match(same.reasons.join('|'), /must differ/);
  // The plan reports presence and custody only — never a value.
  const serialized = JSON.stringify(credentialPlan(baseEnv()));
  assert.equal(serialized.includes(DB_SECRET), false);
  assert.equal(serialized.includes(USER_SECRET), false);
  assert.equal(credentialPlan(baseEnv()).custody.db_password.length > 0, true);
});

test('no secret can reach a log, an error or an evidence file', () => {
  const dirty = `psql failed: PGPASSWORD=${DB_SECRET} user=${USER_SECRET} sbp_abcdefghijklmnop eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc `
    + `https://${STAGING_HOST}/storage/v1/object/sign/private-media/p11f_abcd1234/drop-1.jpg?token=secret-token p11f_abcd1234.a@fixture.invalid`;
  const clean = redactSecrets(dirty, baseEnv());
  for (const secret of [DB_SECRET, USER_SECRET, 'sbp_abcdefghijklmnop', 'secret-token', 'p11f_abcd1234.a@fixture.invalid']) {
    assert.equal(clean.includes(secret), false, `leaked: ${secret}`);
  }
  assert.match(clean, /redacted/);
  assert.equal(redactForEvidence('https://x/storage/v1/object/sign/b/p?token=abc').includes('token=abc'), false);
  // The runner must source the connection secret from the environment, never from argv.
  const source = readFileSync(MODULE_PATH, 'utf8');
  assert.match(source, /PGPASSWORD: env\[CREDENTIAL_ENV\.dbPassword\]/);
  assert.equal(source.includes("'fixture_password='"), false, 'the password must never be a psql argument');
});

test('the psql runner refuses to start without separated credentials', async () => {
  const run = createPsqlRunner(baseEnv({ [CREDENTIAL_ENV.fixtureUserPassword]: '' }));
  await assert.rejects(() => run('select 1'), /refusing: .*STAGING_FIXTURE_USER_PASSWORD/);
  const wrongTarget = createPsqlRunner(baseEnv({ STAGING_DB_TARGET: 'some-other-project' }));
  await assert.rejects(() => wrongTarget('select 1'), /STAGING_DB_TARGET must be/);
});

// ── Finding 2: count parsing is strictly fail-closed ──────────────────────────────────────
test('a malformed inventory can never look like an empty one', () => {
  const bad = ['', 'garbage', '1|2', inventory().split('|').slice(0, -1).join('|'),
    inventory().replace('|0', '|-1'), inventory().replace('|0', '|abc'), `${inventory()}|9`];
  for (const stdout of bad) {
    const parsed = parseCounts(stdout);
    assert.equal(parsed.ok, false, `must be unreadable: ${stdout.slice(0, 24)}`);
    const gate = validateCounts(parsed, { expectZero: true });
    assert.equal(gate.ok, false, 'an unreadable inventory must never authorise a write');
    assert.match(gate.reason, /REFUSING/);
  }
  const good = parseCounts(inventory({ auth_users: 2, profiles: 2 }));
  assert.equal(good.ok, true);
  assert.equal(good.counts.auth_users, 2);
  assert.equal(Object.keys(good.counts).length, COUNT_COLUMNS.length);
  assert.equal(validateCounts(good).ok, true);
  assert.equal(Object.values(good.counts).filter((v) => v === 2).length, 2);
});

test('a dirty prefix, a missing column and an over-ceiling count are all refused', () => {
  const dirty = validateCounts(parseCounts(inventory({ auth_users: 1 })), { expectZero: true });
  assert.equal(dirty.ok, false);
  assert.match(dirty.reason, /prefix is not clean/);
  // The same shape is acceptable for a teardown, which must be able to clean a previous run.
  assert.equal(validateCounts(parseCounts(inventory({ auth_users: 1 })), { expectZero: false }).ok, true);
  const over = validateCounts(parseCounts(inventory({ auth_users: 9 })));
  assert.equal(over.ok, false);
  assert.match(over.reason, /unexpected database state/);
  assert.equal(validateCounts({ ok: true, counts: { auth_users: 1 } }).ok, false);
  assert.match(validateCounts(null).reason, /unreadable inventory/);
  assert.equal(MAX_FIXTURE_COUNTS.notifications >= 1, true, 'the trigger-written notification is bounded, not zero');
});

// ── Finding 3: teardown covers every row the run can create, and stays bounded ─────────────
const RESOLVED = {
  a: { uid: ids(PREFIX).accountA.uid, profileId: ids(PREFIX).accountA.profileId },
  b: { uid: ids(PREFIX).accountB.uid, profileId: ids(PREFIX).accountB.profileId },
};

test('cleanup covers our writes, the trigger-written notifications and the RPC-written rows', () => {
  const text = buildTeardownSql(PREFIX, RESOLVED).join('\n');
  for (const table of ['public.notifications', 'public.rate_limit_events', 'public.digital_creator_sessions',
    'public.creator_ai_messages', 'public.creator_ai_conversations', 'public.creator_ai_profiles',
    'public.course_lessons', 'public.creator_courses', 'public.vault_subscriptions', 'public.vault_drops',
    'public.creator_vaults', 'public.media_objects', 'public.profiles', 'auth.identities', 'auth.users']) {
    assert.ok(text.includes(`delete from ${table}`), `${table} is not cleaned up`);
  }
  assert.ok(text.includes('recipient_id in') && text.includes('actor_id in'), 'trigger-written notifications are removed');
  for (const sql of buildTeardownSql(PREFIX, RESOLVED)) assert.match(sql, /^\s*delete from/i);
});

test('cleanup cannot delete a row that merely shares a creator or actor id', () => {
  const ours = new Set([ids(PREFIX).accountA.profileId, ids(PREFIX).accountB.profileId,
    ids(PREFIX).accountA.uid, ids(PREFIX).accountB.uid, PREFIX, ids(PREFIX).vaultId, ids(PREFIX).courseId,
    ids(PREFIX).conversationId, ids(PREFIX).dropId, ids(PREFIX).mediaId, ids(PREFIX).subscriptionId,
    ids(PREFIX).storagePath, ids(PREFIX).accountA.email, ids(PREFIX).accountB.email]);
  for (const sql of buildTeardownSql(PREFIX, RESOLVED)) {
    for (const value of sql.match(/'[^']*'/g) ?? []) {
      assert.ok(ours.has(value.slice(1, -1)), `a delete is addressed by a foreign value: ${value}`);
    }
  }
  // A cleanup that would key on a shared column without our ids is refused outright.
  assert.throws(() => assertScoped(["delete from public.notifications where recipient_id in ('someone-else')"], PREFIX), /unscoped write/);
  assert.throws(() => assertScoped(['delete from public.vault_drops where creator_id is not null'], PREFIX), /unscoped write/);
  // Idempotent and safe after a PARTIAL setup: an unknown account contributes no statements.
  const partial = buildTeardownSql(PREFIX, { a: null, b: null }).join('\n');
  assert.equal(partial.includes('notifications'), false, 'no account means the account-keyed rows cannot exist');
  assert.equal(partial.includes('public.vault_drops'), true, 'run-id rows are still cleaned');
  assert.deepEqual(buildTeardownSql(PREFIX, RESOLVED), buildTeardownSql(PREFIX, RESOLVED));
});

// ── Finding 4: real password sign-in, via the supported Admin API ─────────────────────────
test('accounts are provisioned through the Auth Admin API and verified by signing in', async () => {
  const { fetchImpl, calls, uids } = mockAuth();
  const provision = await provisionAccounts({ prefix: PREFIX, env: baseEnv(), fetchImpl });
  assert.equal(provision.ok, true);
  assert.equal(provision.uids.a, uids.a);
  const create = calls.find((c) => c.url.endsWith('/auth/v1/admin/users') && c.method === 'POST');
  assert.ok(create, 'must use POST /auth/v1/admin/users');
  assert.match(create.url, /^https:\/\//, 'credentials only ever travel over TLS');
  assert.equal(JSON.parse(create.body).email_confirm, true);
  assert.ok(create.headers.Authorization.startsWith('Bearer '));
  const probe = await signInProbe({ prefix: PREFIX, uids, env: baseEnv(), fetchImpl });
  assert.equal(probe.ok, true);
  assert.deepEqual(probe.verified, ['a', 'b']);
  const wrong = await signInProbe({ prefix: PREFIX, uids, env: baseEnv(), fetchImpl: mockAuth({ wrongUid: true }).fetchImpl });
  assert.equal(wrong.ok, false);
  const refused = await signInProbe({ prefix: PREFIX, uids, env: baseEnv(), fetchImpl: mockAuth({ signInStatus: 400 }).fetchImpl });
  assert.equal(refused.ok, false);
  assert.equal((await signInProbe({ prefix: PREFIX, uids, env: baseEnv({ STAGING_ANON_KEY: '' }) })).ok, false);
  // An existing account is resolved rather than duplicated.
  const already = mockAuth({ alreadyExists: true });
  const again = await provisionAccounts({ prefix: PREFIX, env: baseEnv(), fetchImpl: already.fetchImpl });
  assert.equal(again.ok, true);
  assert.ok(already.calls.some((c) => c.url.includes('page=1')), 'falls back to a lookup');
});

test('the SQL fallback also writes auth.identities, which password sign-in requires', () => {
  const statements = buildIdentitySql(PREFIX).join('\n');
  assert.ok(statements.includes('insert into auth.users'));
  assert.ok(statements.includes('insert into auth.identities'), 'a bare auth.users insert cannot sign in');
  assert.ok(statements.includes('identity_data') && statements.includes("'email'"));
  assert.ok(statements.includes("jsonb_build_object('sub'") && statements.includes("'email_verified', true"));
  assert.ok(statements.includes("crypt(:'fixture_user_password'"), 'the user password stays a psql variable');
  assert.equal(/fixture-user-secret/.test(statements), false);
});

// ── Finding 5: the signed-URL claim is limited to what it proves ──────────────────────────
test('the media claim is explicitly limited to URL signing', () => {
  assert.match(CLAIMS.media, /URL SIGNING ONLY/);
  assert.match(CLAIMS.media, /NOT prove byte retrieval/);
  const setup = buildFixtureSql(PREFIX).setup.join('\n');
  assert.ok(setup.includes('public.media_objects'), 'metadata is written');
  assert.equal(/storage\/v1\/object\/[^ ']*/.test(setup), false, 'no bytes are uploaded');
  assert.equal(setup.includes('drop-1.jpg'), true, 'the path is only a metadata value');
});

// ── Finding 6: every generated value satisfies the real column constraint ─────────────────
test('generated values satisfy the constraints in the hosted migrations', () => {
  const i = ids(PREFIX);
  assert.match(i.storagePath, /^[a-z0-9._/-]+$/);                       // media_objects.storage_path
  assert.match(`${PREFIX}_avatar`, /^[A-Za-z0-9_.:-]{1,120}$/);          // avatar_external_id
  assert.match('fixture_not_connected', /^[a-z0-9_]{1,40}$/);            // avatar_provider slug
  assert.equal(/^[a-z0-9_]{1,40}$/.test('fixture-not-connected'), false, 'hyphens are what 16A got wrong');
  assert.match(`${PREFIX}_a`, /^[a-z0-9._]{3,20}$/);                     // profiles.handle
  assert.match(`u_${i.accountA.uid.replace(/-/g, '')}`, /^u_[0-9a-f]{32}$/);
  for (const [text, max] of [['fixture drop', 280], ['Fixture Vault', 60], ['Fixture Course', 80], ['Fixture Lesson', 80], ['Fixture Draft Lesson', 80], ['Fixture AI', 40]]) {
    assert.ok(text.length >= 1 && text.length <= max, `${text} out of range`);
  }
  assert.ok(i.lessonSecret.length <= 8000);                              // course_lessons.body_text
  const setup = buildFixtureSql(PREFIX).setup.join('\n');
  assert.ok(setup.includes("'fixture_not_connected'"));
  assert.equal(setup.includes("'fixture-not-connected'"), false);
  assert.ok(setup.includes("'subscriber', 'published'") && setup.includes("'subscriber', 'draft'"));
  assert.ok(setup.includes("'private-media'") && setup.includes("'ready'") && setup.includes("'image'"));
  assert.ok(setup.includes("interval '7 days'"), 'the 7-day drop window constraint is honoured');
  assert.ok(setup.includes("'active', now() - interval '30 days'"), 'the lapsed window keeps the period check true');
  assert.equal(/insert into public.digital_creator_sessions/.test(setup), false, 'sessions come from the RPC only');
});

// ── Finding 7: the corrected failure conditions, end to end ───────────────────────────────
test('create refuses a dirty prefix or an unreadable inventory before writing anything', async () => {
  const dirty = recordingRunner({ row: inventory({ auth_users: 1 }) });
  const refused = await runFixtureAction({ action: 'create', env: baseEnv(), runSql: dirty.run });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /prefix is not clean/);
  assert.equal(dirty.seen.length, 1, 'only the pre-flight count was sent');
  const garbled = recordingRunner({ row: 'garbage' });
  const stopped = await runFixtureAction({ action: 'create', env: baseEnv(), runSql: garbled.run });
  assert.equal(stopped.ok, false);
  assert.match(stopped.reason, /unreadable inventory/);
  assert.equal(garbled.seen.length, 1);
});

test('create refuses without separated credentials, and never echoes one', async () => {
  const runner = recordingRunner();
  const res = await runFixtureAction({ action: 'create', env: baseEnv({ [CREDENTIAL_ENV.dbPassword]: '' }), runSql: runner.run });
  assert.equal(res.stopped, true);
  assert.match(res.reason, /STAGING_DB_PASSWORD/);
  assert.equal(runner.seen.length, 0, 'no connection is attempted');
  assert.equal(JSON.stringify(res).includes(DB_SECRET), false);
  assert.equal(JSON.stringify(res).includes(USER_SECRET), false);
});

test('a failed sign-in probe stops the run and keeps cleanup available', async () => {
  const runner = recordingRunner();
  const res = await runFixtureAction({ action: 'create', env: baseEnv(), runSql: runner.run, fetchImpl: mockAuth({ signInStatus: 400 }).fetchImpl });
  assert.equal(res.ok, false);
  assert.equal(res.reason_code, 'SIGNIN_PROBE_FAILED');
  assert.equal(res.cleanup_available, true);
  assert.equal(res.evidence_preserved, true);
  assert.equal(runner.seen.some((s) => /^\s*insert/i.test(s)), false, 'no fixture row was written');
});

test('a successful create verifies the exact inventory, including the trigger notification', async () => {
  const created = inventory({ auth_users: 2, identities: 2, profiles: 2, notifications: 1, creator_vaults: 1,
    vault_drops: 1, media_objects: 1, vault_subscriptions: 1, creator_courses: 1, course_lessons: 2,
    creator_ai_profiles: 1, creator_ai_conversations: 1, creator_ai_messages: 1 });
  const runner = recordingRunner({ rows: [inventory(), created] });
  const res = await runFixtureAction({ action: 'create', env: baseEnv(), runSql: runner.run, fetchImpl: mockAuth().fetchImpl });
  assert.equal(res.ok, true, res.reason);
  assert.equal(res.identity_mode, 'admin-api');
  assert.equal(res.executed, buildFixtureSql(PREFIX, { uids: res.account_uids }).setup.length);
  assert.match(res.manifest.claims.media, /URL SIGNING ONLY/);
  assert.equal(JSON.stringify(res).includes(USER_SECRET), false);
});

test('a create that produces the wrong inventory is refused, with cleanup left available', async () => {
  const runner = recordingRunner({ rows: [inventory(), inventory({ auth_users: 2 })] });
  const res = await runFixtureAction({ action: 'create', env: baseEnv(), runSql: runner.run, fetchImpl: mockAuth().fetchImpl });
  assert.equal(res.ok, false);
  assert.match(res.reason, /notifications=0/);
  assert.equal(res.cleanup_available, true);
  const withSession = { ...Object.fromEntries(COUNT_COLUMNS.map((k) => [k, 0])), digital_creator_sessions: 1 };
  assert.equal(verifyAfterCreate({ ok: true, counts: withSession }).ok, false);
});

test('a partial setup failure stops, reports where, and issues no DELETE', async () => {
  const runner = recordingRunner({ failWriteAt: 3, row: inventory() });
  const res = await runFixtureAction({ action: 'create', env: baseEnv(), runSql: runner.run, fetchImpl: mockAuth().fetchImpl });
  assert.equal(res.ok, false);
  assert.equal(res.executed, 2);
  assert.equal(res.failed_statement_index, 2);
  assert.equal(res.cleanup_available, true);
  assert.equal(runner.seen.some((s) => /^\s*delete/i.test(s)), false, 'a failure never triggers automatic cleanup');
});

test('teardown resolves the accounts, deletes, and verifies the prefix is empty again', async () => {
  const resolveRow = `${RESOLVED.a.uid}|${ids(PREFIX).accountA.email}\n${RESOLVED.b.uid}|${ids(PREFIX).accountB.email}`;
  const seen = [];
  const runSql = async (sql) => {
    seen.push(sql);
    if (!/^\s*select/i.test(sql)) return '';
    return /count\(\*\)/.test(sql) ? inventory() : resolveRow;
  };
  const res = await runFixtureAction({ action: 'teardown', env: baseEnv(), runSql, fetchImpl: mockAuth().fetchImpl });
  assert.equal(res.ok, true, res.reason);
  assert.equal(res.executed, buildTeardownSql(PREFIX, RESOLVED).length);
  assert.equal(res.account_uids.a, RESOLVED.a.uid);
  assert.equal(seen.filter((s) => /^\s*delete/i.test(s)).length, res.executed);
  assert.equal(res.admin_api.ok, true, 'the supported API removal is attempted too');
});

test('teardown needs the cleanup token, not the create token', async () => {
  const seen = [];
  const runSql = async (sql) => { seen.push(sql); return inventory(); };
  const res = await runFixtureAction({ action: 'teardown', env: baseEnv({ STAGING_FIXTURES_CLEANUP_AUTHORIZATION: AUTHORIZATION_TOKENS.create }), runSql });
  assert.equal(res.stopped, true);
  assert.match(res.reason, /CLEANUP_AUTHORIZATION/);
  assert.equal(seen.length, 0, 'an unauthorized teardown sends nothing');
});

test('parseResolved maps by email and tolerates a missing account', () => {
  const rows = `${RESOLVED.a.uid}|${ids(PREFIX).accountA.email}`;
  const parsed = parseResolved(null, rows, PREFIX);
  assert.equal(parsed.a.uid, RESOLVED.a.uid);
  assert.equal(parsed.a.profileId, RESOLVED.a.profileId);
  assert.equal(parsed.b.uid, null);
  assert.equal(parseResolved(null, 'garbage', PREFIX).a.uid, null);
  assert.equal(parseResolved(null, '', PREFIX).b.uid, null);
});

test('fixture ids stay deterministic and prefix-validated', () => {
  assert.deepEqual(ids(PREFIX), ids(PREFIX));
  assert.equal(ids(PREFIX).dropId, `${PREFIX}_drop`);
  assert.equal(ids(PREFIX).accountA.email, `${PREFIX}.a@fixture.invalid`);
  assert.notEqual(ids(PREFIX).accountA.email, ids('p11f_zzzz9999').accountA.email);
  assert.equal(PREFIX_RE.test('p11f_ABCD1234'), false);
  assert.throws(() => ids('nope'), /prefix must match/);
  assert.equal(buildResolveSql(PREFIX).includes(ids(PREFIX).accountA.email), true);
  assert.equal(buildCountSql(PREFIX).includes(PREFIX), true);
});

test('evidence can only be purged from a fixed list', () => {
  assert.deepEqual(EVIDENCE_FILES.sort(), ['fixture-create-evidence.json', 'fixture-status-evidence.json', 'fixture-teardown-evidence.json'].sort());
  assert.equal(EVIDENCE_FILES.every((f) => !f.includes('/') && !f.includes('..')), true);
  assert.equal(EVIDENCE_FILES.some((f) => f.endsWith('manifest.json')), false, 'the manifest is never purged by the evidence flag');
});
