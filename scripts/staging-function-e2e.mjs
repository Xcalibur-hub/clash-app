/**
 * Staging Edge Function authenticated E2E harness (Phase 11 Step 15).
 *
 * TWO SUITES:
 *   · `no-fixture`   — runs with NO hosted user, NO fixture, NO write. Every probe is
 *                      rejected before any function code runs (gateway JWT check).
 *   · `authenticated` — the full plan; REQUIRES separately authorized hosted fixtures.
 *                      It refuses to run and never creates users, uploads media or
 *                      writes to the database.
 *
 * The harness refuses any host that is not exactly the staging Edge Function host.
 */
import { createHmac } from 'node:crypto';
import { FUNCTIONS_V1, STAGING_HOST, assertStagingTarget, buildFunctionUrl } from './staging-host.mjs';

// Re-exported so existing callers and tests keep their single import site.
export { FUNCTIONS_V1, STAGING_HOST, assertStagingTarget, buildFunctionUrl };

export const DEPLOYED = ['vault-media-access', 'course-lesson-media-access', 'creator-ai', 'digital-creator'];
export const NOT_DEPLOYED = ['arena-editorial', 'arena-gifs'];

/** HS256 JWT builder for negative-auth probes only (never a real credential). */
export function craftJwt({ secret, role = 'authenticated', exp, sub = '00000000-0000-0000-0000-000000000000' }) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ iss: 'probe', role, sub, iat: 0, exp });
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

/** Any 4xx/5xx means the platform or the function refused the request. */
export function checkRejected(status) {
  if (typeof status !== 'number') return { ok: false, reason: `no HTTP status (${status})` };
  if (status < 400) return { ok: false, reason: `expected rejection, saw ${status}` };
  return { ok: true, reason: `rejected with ${status}` };
}

const LEAK_PATTERNS = [
  /\beyJ[A-Za-z0-9_-]{8,}\./,
  /sbp_[A-Za-z0-9]{16,}/,
  /service_role/i,
  /\bat\s+\S+:\d+:\d+/,
  /TypeError|ReferenceError|SyntaxError/,
  /\bDATABASE_URL\b|\bSUPABASE_SERVICE_ROLE_KEY\b/,
  /\/app\/|\/functions\/v1\//,
];

/** Error responses must not echo internals, tokens or stack traces. */
export function checkNoLeak(bodyText) {
  const text = String(bodyText ?? '');
  const hit = LEAK_PATTERNS.find((re) => re.test(text));
  if (hit) return { ok: false, reason: `response body leaks internals (${hit})` };
  return { ok: true, reason: `sanitized (${text.length} bytes)` };
}

export function checkCorsPreflight(allowOrigin) {
  if (!allowOrigin) return { ok: false, reason: 'missing Access-Control-Allow-Origin' };
  return { ok: true, reason: `allow-origin=${allowOrigin}` };
}

export function summarize(results) {
  const failed = results.filter((r) => !r.ok);
  return { total: results.length, passed: results.length - failed.length, failed: failed.length };
}

/** Suite runnable TODAY: no user, no fixture, no write. */
export const NO_FIXTURE_CASES = [
  { id: 'unauth_post', method: 'POST', auth: 'none', expect: 'rejected' },
  { id: 'malformed_jwt', method: 'POST', auth: 'malformed', expect: 'rejected' },
  { id: 'wrong_secret_jwt', method: 'POST', auth: 'wrong_secret', expect: 'rejected' },
  { id: 'expired_jwt', method: 'POST', auth: 'expired', expect: 'rejected' },
  { id: 'cors_preflight', method: 'OPTIONS', auth: 'none', expect: 'preflight' },
  { id: 'get_no_auth', method: 'GET', auth: 'none', expect: 'rejected' },
];

/** Fixture-dependent plan (must NOT run without separate authorization). */
export const AUTHENTICATED_PLAN = [
  { id: 'auth.sign_in', area: 1, fixtures: ['test account'], checks: 'valid JWT yields a session; Postgres resolves the caller from the JWT' },
  { id: 'vault.entitled_media', area: 2, fixtures: ['account A', 'private drop owned by A with a private-media object'], checks: '200 + signed URL with expiresIn=120' },
  { id: 'vault.unauthorized_media', area: 3, fixtures: ['account B'], checks: '403, no Storage call, no path leak' },
  { id: 'vault.cross_user_access', area: 3, fixtures: ['drop owned by A + account B'], checks: '403 identical to a non-existent drop (no existence oracle)' },
  { id: 'lesson.entitled', area: 4, fixtures: ['course + subscriber lesson + active subscription'], checks: '200 signed URL; body text still not readable by table SELECT' },
  { id: 'lesson.denied', area: 4, fixtures: ['same course, no/expired subscription'], checks: '403, and expired behaves identically to revoked' },
  { id: 'creator_ai.no_provider', area: 5, fixtures: ['creator + conversation'], checks: 'explicit "provider not configured"; never a fabricated answer' },
  { id: 'digital_creator.no_provider', area: 5, fixtures: ['creator digital profile + authorized reply'], checks: 'explicit "not connected"; no arbitrary text rendered' },
  { id: 'input_validation', area: 6, fixtures: ['account A'], checks: 'wrong types / oversize ids / missing fields yield 400, never 500' },
  { id: 'response_sanitization', area: 6, fixtures: ['any authorized call'], checks: 'no tokens, env names, stack frames or storage paths in any body' },
  { id: 'rls_tenant_isolation', area: 7, fixtures: ['two accounts, one private row each'], checks: 'A cannot observe B through any function response; direct table reads denied' },
];

function authHeader(auth) {
  if (auth === 'malformed') return 'Bearer not-a-jwt';
  if (auth === 'wrong_secret') return `Bearer ${craftJwt({ secret: 'probe-secret-not-real', exp: 4102444800 })}`;
  if (auth === 'expired') return `Bearer ${craftJwt({ secret: 'probe-secret-not-real', exp: 1 })}`;
  return null;
}

async function probe(fn, method, auth, id) {
  const headers = { 'Content-Type': 'application/json' };
  const h = authHeader(auth);
  if (h) headers.Authorization = h;
  const init = { method, headers, signal: AbortSignal.timeout(15000) };
  if (method === 'POST') init.body = '{}';
  try {
    const res = await fetch(buildFunctionUrl(fn), init);
    const text = await res.text();
    return { name: fn, case: id, status: res.status, body: text.slice(0, 300), cors: res.headers.get('access-control-allow-origin') };
  } catch (e) {
    return { name: fn, case: id, status: 'error', body: '', detail: `network: ${e?.name}` };
  }
}

/** Runs every no-fixture probe against the deployed staging functions. */
export async function runNoFixtureSuite() {
  const results = [];
  for (const fn of DEPLOYED) {
    for (const c of NO_FIXTURE_CASES) {
      const r = await probe(fn, c.method, c.auth, c.id);
      if (c.expect === 'preflight') {
        const cors = checkCorsPreflight(r.cors);
        const statusOk = r.status === 200 || r.status === 204;
        results.push({ ...r, ok: statusOk && cors.ok, detail: `status=${r.status}; ${cors.reason}` });
      } else {
        const rej = checkRejected(r.status);
        const leak = checkNoLeak(r.body);
        results.push({ ...r, ok: rej.ok && leak.ok, detail: `${rej.reason}; ${leak.reason}` });
      }
    }
  }
  for (const gone of NOT_DEPLOYED) {
    const r = await probe(gone, 'POST', 'none', 'not_deployed');
    results.push({ ...r, ok: r.status === 404, detail: `status=${r.status} (expected 404: not deployed)` });
  }
  return results;
}

/**
 * The PLAN-level gate (Step 15 semantics, tightened in Step 16A): the run is allowed only
 * when the fixtures exist for this very prefix, the credential inputs are present, and the
 * separate *execution* authorization was granted. Execution additionally re-checks this in
 * `authenticatedGate`, so a `runnable: true` here is necessary but never sufficient.
 */
export function planAuthenticated(env = process.env, manifest = null) {
  const ref = STAGING_HOST.split('.')[0];
  const haveUrl = (env.STAGING_SUPABASE_URL ?? '') === `https://${STAGING_HOST}`;
  const haveAnon = Boolean(env.STAGING_ANON_KEY);
  const haveUser = Boolean(env.STAGING_TEST_EMAIL && env.STAGING_TEST_PASSWORD) || Boolean(env.STAGING_TEST_ACCESS_TOKEN);
  const authorized = env.STAGING_FIXTURES_EXECUTE_AUTHORIZATION === `fixture-execute:${ref}`;
  const hasManifest = Boolean(manifest?.prefix && manifest?.ids);
  const prefixMatches = hasManifest && env.STAGING_FIXTURE_PREFIX === manifest.prefix;
  const runnable = haveUrl && haveAnon && haveUser && authorized && hasManifest && prefixMatches;
  return {
    runnable, haveUrl, haveAnon, haveUser, authorized, hasManifest, prefixMatches,
    reason: runnable
      ? 'fixtures, credentials and the execution authorization are all present'
      : `NEEDS_FIXTURE_AUTHORIZATION: fixtures for the run prefix, a test account, the project anon key, and STAGING_FIXTURES_EXECUTE_AUTHORIZATION=fixture-execute:${ref}`,
  };
}


function parse(argv) {
  const out = { suite: 'no-fixture', evidence: `.expo/staging-e2e/${Date.now()}`, manifest: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--suite') out.suite = String(argv[++i] ?? '');
    else if (argv[i] === '--evidence-dir') out.evidence = String(argv[++i] ?? '');
    else if (argv[i] === '--manifest') out.manifest = String(argv[++i] ?? '');
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return out;
}

function invokedDirectly() {
  return Boolean(process.argv[1]) && process.argv[1].endsWith('staging-function-e2e.mjs');
}

if (invokedDirectly()) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const evidence = { step: 'phase-11-15', started_at: new Date().toISOString(), project_ref: STAGING_HOST.split('.')[0] };
  try {
    const args = parse(process.argv.slice(2));
    if (!['no-fixture', 'authenticated', 'plan'].includes(args.suite)) throw new Error(`unknown suite: ${args.suite}`);
    evidence.suite = args.suite;
    if (args.suite === 'plan') {
      evidence.no_fixture_cases = NO_FIXTURE_CASES.map((c) => c.id);
      evidence.authenticated_plan = AUTHENTICATED_PLAN;
      evidence.authenticated_prerequisites = planAuthenticated();
      evidence.result = 'PLAN ONLY';
    } else if (args.suite === 'authenticated') {
      // The eleven checks are EXECUTABLE. They run only when every gate passes; otherwise
      // the suite stops without sending an authenticated request.
      const { runAuthenticatedSuite } = await import('./staging-function-e2e-authenticated.mjs');
      const manifest = args.manifest ? JSON.parse(fs.readFileSync(args.manifest, 'utf8')) : null;
      const p = planAuthenticated(process.env, manifest);
      const run = await runAuthenticatedSuite({ fetchImpl: fetch, manifest, log: (line) => console.log(line) });
      evidence.authenticated_prerequisites = p;
      evidence.plan = AUTHENTICATED_PLAN;
      evidence.authenticated = run;
      evidence.result = run.stopped ? 'STOPPED' : run.failed === 0 ? 'PASS' : 'FAIL';
      evidence.reason = run.stopped ? run.reason : `${run.passed}/${run.total} authenticated checks passed`;
    } else {
      const results = await runNoFixtureSuite();
      evidence.results = results;
      evidence.summary = summarize(results);
      evidence.result = evidence.summary.failed === 0 ? 'PASS' : 'FAIL';
      evidence.secrets_read = false;
      evidence.hosted_writes = false;
      evidence.note = 'every probe is rejected before any function code runs; no fixture, user, upload or database write';
    }
    fs.mkdirSync(args.evidence, { recursive: true });
    fs.writeFileSync(path.join(args.evidence, 'e2e-evidence.json'), JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(['PASS', 'PLAN ONLY'].includes(evidence.result) ? 0 : 1);
  } catch (e) {
    evidence.result = 'STOPPED';
    evidence.reason = String(e?.message ?? e);
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(2);
  }
}

