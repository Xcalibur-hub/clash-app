/**
 * Offline tests for the authenticated E2E suite (Phase 11 Step 16A).
 * MOCKED HTTP: no network, no credentials, no hosted call of any kind.
 * Run: node --test scripts/staging-function-e2e-authenticated.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUTHENTICATED_PLAN, STAGING_HOST } from './staging-function-e2e.mjs';
import { ids } from './staging-fixtures.mjs';
import {
  CHECK_ORDER, authenticatedGate, runAuthenticatedSuite, scanForMarkers, signIn,
} from './staging-function-e2e-authenticated.mjs';

const PREFIX = 'p11f_abcd1234';
const M = ids(PREFIX);
const BASE = `https://${STAGING_HOST}`;
const TOK = { a: 'token-account-a', b: 'token-account-b' };

const jsonResponse = (status, body) => ({
  status,
  text: async () => JSON.stringify(body),
  headers: new Map(),
});

/** A faithful mock of the four deployed functions, GoTrue and PostgREST. */
function mockApi({ sabotage = () => null } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const token = (init.headers?.Authorization ?? '').replace('Bearer ', '');
    calls.push({ path: u.pathname, method: init.method, token, body: init.body });
    const override = sabotage({ path: u.pathname, token, body: init.body });
    if (override) return jsonResponse(override[0], override[1]);

    if (u.pathname === '/auth/v1/token') {
      const { email, password } = JSON.parse(init.body);
      const expected = password === 'test-password';
      const user = email === M.accountA.email ? M.accountA.uid : M.accountB.uid;
      return expected
        ? jsonResponse(200, { access_token: email === M.accountA.email ? TOK.a : TOK.b, user: { id: user } })
        : jsonResponse(400, { error: 'invalid_grant' });
    }

    if (u.pathname === '/rest/v1/creator_ai_messages') {
      return jsonResponse(200, token === TOK.b ? [{ body: `${PREFIX}_seed_message` }] : []);
    }
    if (u.pathname === '/rest/v1/media_objects') {
      return jsonResponse(200, token === TOK.a ? [{ storage_path: M.storagePath }] : []);
    }
    if (u.pathname === '/rest/v1/course_lessons') return jsonResponse(200, []);

    const name = u.pathname.split('/').pop();
    const body = init.body ? JSON.parse(init.body) : {};
    if (name === 'vault-media-access') {
      // Validation precedes entitlement, exactly as the deployed function orders it.
      const id = body.dropId;
      if (typeof id !== 'string' || id.length === 0 || id.length > 64) return jsonResponse(400, { error: 'bad_request' });
      if (id !== M.dropId || token !== TOK.a) return jsonResponse(403, { error: 'forbidden' });
      return jsonResponse(200, { url: `${BASE}/storage/v1/object/sign/private-media/${M.storagePath}?token=abc`,
        bucket: 'private-media', mediaKind: 'image', expiresIn: 120 });
    }
    if (name === 'course-lesson-media-access') {
      const id = body.lessonId;
      if (typeof id !== 'string' || id.length === 0 || id.length > 64) return jsonResponse(400, { error: 'bad_request' });
      if (token !== TOK.a) return jsonResponse(403, { error: 'forbidden' });
      return jsonResponse(200, { url: `${BASE}/storage/v1/object/sign/private-media/${M.storagePath}?token=abc`,
        bucket: 'private-media', mediaKind: 'image', expiresIn: 120 });
    }
    if (name === 'creator-ai') {
      if (typeof body.message === 'string' && body.message.length > 1000) return jsonResponse(400, { error: 'bad_request' });
      return jsonResponse(200, { status: 'unconfigured', provider: 'none', message: 'AI provider not configured' });
    }
    if (name === 'digital-creator') {
      if (body.mode === 'AVATAR') return jsonResponse(409, { status: 'error', error: 'session_rejected' });
      return jsonResponse(200, { status: 'unconfigured', provider: 'none', mode: body.mode });
    }
    return jsonResponse(404, { error: 'not_found' });
  };
  return { fetchImpl, calls };
}

const fullEnv = (over = {}) => ({
  STAGING_SUPABASE_URL: BASE,
  STAGING_ANON_KEY: 'public-anon-key',
  STAGING_TEST_EMAIL: M.accountA.email,
  STAGING_TEST_PASSWORD: 'test-password',
  STAGING_FIXTURE_PREFIX: PREFIX,
  STAGING_FIXTURES_EXECUTE_AUTHORIZATION: `fixture-execute:${STAGING_HOST.split('.')[0]}`,
  ...over,
});

const manifest = { prefix: PREFIX, ids: M };


test('all eleven authenticated checks pass against a faithful mock', async () => {
  const { fetchImpl, calls } = mockApi();
  const run = await runAuthenticatedSuite({ fetchImpl, env: fullEnv(), manifest });
  const failed = run.results.filter((r) => !r.ok).map((r) => `${r.id}: ${r.detail}`);
  assert.equal(run.stopped, false, JSON.stringify(run.gate ?? {}));
  assert.equal(run.total, 11);
  assert.equal(run.failed, 0, failed.join(' | '));
  assert.equal(calls.filter((c) => c.path === '/auth/v1/token').length, 3, 'two sign-ins plus the wrong-password probe');
});

test('the eleven cases are wired, not merely declared', () => {
  assert.deepEqual(CHECK_ORDER, AUTHENTICATED_PLAN.map((p) => p.id));
  assert.equal(CHECK_ORDER.length, 11);
});

test('the suite fails closed and sends NO HTTP when a gate is missing', async () => {
  const variants = {
    'empty env': fullEnv({ STAGING_SUPABASE_URL: '', STAGING_ANON_KEY: '', STAGING_TEST_EMAIL: '', STAGING_TEST_PASSWORD: '', STAGING_FIXTURES_EXECUTE_AUTHORIZATION: '' }),
    'missing anon key': fullEnv({ STAGING_ANON_KEY: '' }),
    'missing credentials': fullEnv({ STAGING_TEST_EMAIL: '', STAGING_TEST_PASSWORD: '' }),
    'no execute authorization': fullEnv({ STAGING_FIXTURES_EXECUTE_AUTHORIZATION: '' }),
    'wrong project': fullEnv({ STAGING_SUPABASE_URL: 'https://other-project.supabase.co' }),
    'authorization for another project': fullEnv({ STAGING_FIXTURES_EXECUTE_AUTHORIZATION: 'fixture-execute:otherref' }),
    'prefix does not match the manifest': fullEnv({ STAGING_FIXTURE_PREFIX: 'p11f_zzzz9999' }),
  };
  for (const [label, env] of Object.entries(variants)) {
    const { fetchImpl, calls } = mockApi();
    const run = await runAuthenticatedSuite({ fetchImpl, env, manifest });
    assert.equal(run.stopped, true, `${label} must stop`);
    assert.equal(run.results.length, 0, `${label} must run nothing`);
    assert.equal(calls.length, 0, `${label} must not send a request`);
  }
  const noManifest = await runAuthenticatedSuite({ fetchImpl: mockApi().fetchImpl, env: fullEnv(), manifest: null });
  assert.equal(noManifest.stopped, true);
  assert.match(noManifest.reason, /manifest/);
  assert.equal(authenticatedGate(fullEnv(), manifest).runnable, true);
  assert.equal(authenticatedGate(fullEnv({ STAGING_ANON_KEY: '' }), manifest).runnable, false);
});

test('every check turns the suite red on its own failure mode', async () => {
  const cases = [
    ['service_role leak in a body', 'response_sanitization', ({ path }) =>
      path.endsWith('vault-media-access') ? [200, { url: `${BASE}/storage/v1/object/sign/private-media/x?token=1`, bucket: 'private-media', mediaKind: 'image', expiresIn: 120, note: 'service_role' }] : null],
    ['fabricated AI reply', 'creator_ai.no_provider', ({ path }) =>
      path.endsWith('creator-ai') ? [200, { status: 'ok', provider: 'none', message: { body: 'an invented answer' } }] : null],
    ['denial discloses a storage path', 'vault.unauthorized_media', ({ path, token }) =>
      path.endsWith('vault-media-access') && token === TOK.b ? [403, { error: 'forbidden', hint: 'private-media/1f/drop-1.jpg' }] : null],
    ['existence oracle (403 vs 404)', 'vault.cross_user_access', ({ path, body }) =>
      path.endsWith('vault-media-access') && String(body).includes('absent') ? [404, { error: 'not_found' }] : null],
    ['RLS leak of another account row', 'rls_tenant_isolation', ({ path }) =>
      path === '/rest/v1/media_objects' ? [200, [{ storage_path: `${PREFIX}/drop-1.jpg` }]] : null],
    ['sign-in refused', 'auth.sign_in', ({ path }) =>
      path === '/auth/v1/token' ? [401, { error: 'invalid_credentials' }] : null],
  ];
  for (const [label, expected, sabotage] of cases) {
    const { fetchImpl } = mockApi({ sabotage });
    const run = await runAuthenticatedSuite({ fetchImpl, env: fullEnv(), manifest });
    assert.equal(run.stopped, false, label);
    const failing = run.results.filter((r) => !r.ok).map((r) => r.id);
    assert.ok(failing.includes(expected), `${label}: expected ${expected} to fail, got [${failing.join(', ')}]`);
    assert.equal(run.total, 11, `${label}: one failure must not hide the other checks`);
  }
});

test('signIn never throws and reports the upstream status', async () => {
  const refused = await signIn({ fetchImpl: async () => jsonResponse(500, { message: 'boom' }), url: BASE, anonKey: 'k', email: 'a@b.c', password: 'x' });
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 500);
  const threw = await signIn({ fetchImpl: async () => { throw new Error('network'); }, url: BASE, anonKey: 'k', email: 'a@b.c', password: 'x' });
  assert.equal(threw.ok, false);
  assert.equal(threw.status, 'error');
});

test('scanForMarkers flags secrets and stack frames but not ordinary errors', () => {
  assert.equal(scanForMarkers('{"error":"forbidden"}').ok, true);
  assert.equal(scanForMarkers('{"error":"forbidden"}').found.length, 0);
  for (const bad of ['sbp_abcdefghijklmnop', 'service_role', 'at Object.handler', 'Deno.env.get']) {
    assert.equal(scanForMarkers(`{"x":"${bad}"}`).ok, false, bad);
  }
});
