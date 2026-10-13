/**
 * Offline tests for the staging Edge Function E2E harness (Phase 11 Step 15).
 * No network: every helper is exercised directly.
 * Run: node --test scripts/staging-function-e2e.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AUTHENTICATED_PLAN, DEPLOYED, NO_FIXTURE_CASES, NOT_DEPLOYED, STAGING_HOST, buildFunctionUrl, checkCorsPreflight,
  checkNoLeak, checkRejected, craftJwt, planAuthenticated, summarize,
} from './staging-function-e2e.mjs';

test('the harness refuses any host that is not the staging Edge Function host', () => {
  assert.throws(() => buildFunctionUrl('vault-media-access', 'example.supabase.co'), /not the staging Edge Function host/);
  assert.throws(() => buildFunctionUrl('vault-media-access', 'localhost'), /not the staging Edge Function host/);
  assert.equal(buildFunctionUrl('creator-ai'), `https://${STAGING_HOST}/functions/v1/creator-ai`);
});

test('JWT crafting produces a well-formed HS256 token whose signature depends on the secret', () => {
  const a = craftJwt({ secret: 'one', exp: 4102444800 });
  const b = craftJwt({ secret: 'two', exp: 4102444800 });
  assert.equal(a.split('.').length, 3);
  const claims = JSON.parse(Buffer.from(a.split('.')[1], 'base64url').toString());
  assert.equal(claims.role, 'authenticated');
  assert.equal(claims.exp, 4102444800);
  assert.notEqual(a.split('.')[2], b.split('.')[2]);
});

test('rejection classification accepts 4xx/5xx and rejects success codes', () => {
  for (const s of [400, 401, 403, 405, 404, 500]) assert.equal(checkRejected(s).ok, true, String(s));
  for (const s of [200, 204, 302]) assert.equal(checkRejected(s).ok, false, String(s));
  assert.equal(checkRejected('error').ok, false);
});

test('response sanitization catches tokens, stack frames, env names and source paths', () => {
  assert.equal(checkNoLeak('{"error":"unauthenticated"}').ok, true);
  assert.equal(checkNoLeak('{"msg":"Authorization: invalid"}').ok, true);
  for (const leak of [
    '{"token":"' + craftJwt({ secret: 'x', exp: 1 }) + '"}',
    'sbp_abcdefghijklmnopqrst',
    'supabase_service_role_key missing',
    '    at handler (file:///app/index.ts:12:5)',
    'TypeError: cannot read property',
    '{"path":"/functions/v1/vault-media-access"}',
  ]) {
    assert.equal(checkNoLeak(leak).ok, false, `must flag: ${leak.slice(0, 40)}`);
  }
});

test('CORS preflight requires an allow-origin header', () => {
  assert.equal(checkCorsPreflight('*').ok, true);
  assert.equal(checkCorsPreflight(null).ok, false);
  assert.equal(checkCorsPreflight('').ok, false);
});

test('summarize counts passes and failures', () => {
  assert.deepEqual(summarize([{ ok: true }, { ok: false }, { ok: true }]), { total: 3, passed: 2, failed: 1 });
});

test('the no-fixture suite covers the immediately runnable probes', () => {
  const ids = NO_FIXTURE_CASES.map((c) => c.id);
  for (const expected of ['unauth_post', 'malformed_jwt', 'wrong_secret_jwt', 'expired_jwt', 'cors_preflight', 'get_no_auth']) {
    assert.ok(ids.includes(expected), `missing ${expected}`);
  }
  assert.equal(NO_FIXTURE_CASES.every((c) => c.method && c.expect), true);
});

test('the authenticated plan covers all seven required areas', () => {
  const areas = new Set(AUTHENTICATED_PLAN.map((p) => p.area));
  for (const a of [1, 2, 3, 4, 5, 6, 7]) assert.ok(areas.has(a), `area ${a} missing`);
  assert.equal(AUTHENTICATED_PLAN.every((p) => Array.isArray(p.fixtures) && p.checks), true);
  assert.deepEqual(NOT_DEPLOYED, ['arena-editorial', 'arena-gifs']);
  assert.deepEqual(DEPLOYED.length, 4);
});

test('the authenticated suite refuses to run without fixtures and explicit authorization', () => {
  const denied = planAuthenticated({});
  assert.equal(denied.runnable, false);
  assert.match(denied.reason, /NEEDS_FIXTURE_AUTHORIZATION/);
  const partial = planAuthenticated({ STAGING_SUPABASE_URL: `https://${STAGING_HOST}`, STAGING_ANON_KEY: 'x' });
  assert.equal(partial.runnable, false);
  const wrongRef = planAuthenticated({ STAGING_SUPABASE_URL: `https://${STAGING_HOST}`, STAGING_ANON_KEY: 'x', STAGING_TEST_EMAIL: 'a@b.c', STAGING_TEST_PASSWORD: 'x', STAGING_FIXTURES_EXECUTE_AUTHORIZATION: 'fixture-execute:otherref' });
  assert.equal(wrongRef.runnable, false);
  const full = { STAGING_SUPABASE_URL: `https://${STAGING_HOST}`, STAGING_ANON_KEY: 'x', STAGING_TEST_EMAIL: 'a@b.c', STAGING_TEST_PASSWORD: 'x', STAGING_FIXTURES_EXECUTE_AUTHORIZATION: `fixture-execute:${STAGING_HOST.split('.')[0]}` };
  // The Step 15 token is NOT enough any more: fixtures + the matching prefix are required too.
  assert.equal(planAuthenticated({ ...full, STAGING_FIXTURES_AUTHORIZATION: `fixtures:${STAGING_HOST.split('.')[0]}` }).runnable, false);
  const manifest = { prefix: 'p11f_abcd1234', ids: { dropId: 'p11f_abcd1234_drop' } };
  assert.equal(planAuthenticated(full, manifest).runnable, false, 'prefix must match the manifest');
  const okPlan = planAuthenticated({ ...full, STAGING_FIXTURE_PREFIX: manifest.prefix }, manifest);
  assert.equal(okPlan.runnable, true);
  assert.equal(okPlan.hasManifest, true);
  assert.equal(okPlan.prefixMatches, true);
});
