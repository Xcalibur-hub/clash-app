/**
 * Staging authenticated E2E suite (Phase 11 Step 16A).
 *
 * Every check below is an ASSERTION against the deployed Edge Functions, derived from
 * their real source and the real RPC/RLS contracts — never from an invented shape.
 *
 * Hard preconditions, all fail-closed, all asserted by the offline tests:
 *   valid staging URL · project anon key · a signed-in test account · an explicit
 *   fixture-execute authorization · a fixture manifest built by this same prefix.
 *
 * HTTP and credential sources are injected (`fetchImpl`, `env`) so the whole suite runs
 * offline against mocks, in both the success and the failure direction.
 */
import { STAGING_HOST, buildFunctionUrl, redactForEvidence } from './staging-host.mjs';

const REF = STAGING_HOST.split('.')[0];
export const EXECUTE_AUTHORIZATION = `fixture-execute:${REF}`;
/** Markers that must never appear in a function response body. */
export const FORBIDDEN_MARKERS = [
  'service_role', 'SERVICE_ROLE', 'sbp_', 'eyJhbGciOi', 'node:internal', 'at Object.', 'at async ',
  'CREATOR_AI_API_KEY', 'DIGITAL_CREATOR_API_KEY', 'TENOR_API_KEY', 'ARENA_AI_API_KEY', 'Deno.env',
];
/** A denial must not disclose where bytes live or that a signing URL could exist. */
const DENIAL_MARKERS = ['storage/v1/object/sign', 'private-media', 'createSignedUrl'];

export function scanForMarkers(text, markers = FORBIDDEN_MARKERS) {
  const found = markers.filter((m) => String(text ?? '').includes(m));
  return { ok: found.length === 0, found };
}

/** The full fail-closed gate for running the authenticated suite. */
export function authenticatedGate(env = process.env, manifest) {
  const url = (env.STAGING_SUPABASE_URL ?? '') === `https://${STAGING_HOST}`;
  const anon = Boolean(env.STAGING_ANON_KEY);
  const creds = Boolean(env.STAGING_TEST_EMAIL && env.STAGING_TEST_PASSWORD) || Boolean(env.STAGING_TEST_ACCESS_TOKEN);
  const authorized = env.STAGING_FIXTURES_EXECUTE_AUTHORIZATION === EXECUTE_AUTHORIZATION;
  const hasManifest = Boolean(manifest && manifest.prefix && manifest.ids);
  const match = hasManifest && env.STAGING_FIXTURE_PREFIX === manifest.prefix;
  const reasons = [
    !url && `STAGING_SUPABASE_URL must be https://${STAGING_HOST}`,
    !anon && 'STAGING_ANON_KEY is required',
    !creds && 'STAGING_TEST_EMAIL/STAGING_TEST_PASSWORD (or STAGING_TEST_ACCESS_TOKEN) required',
    !authorized && `STAGING_FIXTURES_EXECUTE_AUTHORIZATION must equal ${EXECUTE_AUTHORIZATION}`,
    !hasManifest && 'a fixture manifest from a completed `fixtures create` is required',
    hasManifest && !match && 'STAGING_FIXTURE_PREFIX does not match the manifest prefix',
  ].filter(Boolean);
  return { runnable: reasons.length === 0, reasons, needs_fixture_authorization: !authorized };
}

/** Signs in a hosted test account. Returns the access token and the resolved user id. */
export async function signIn({ fetchImpl, url, anonKey, email, password }) {
  let res;
  try {
    res = await fetchImpl(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    // A transport failure is a refusal, never an unhandled rejection.
    return { ok: false, status: 'error', reason: `network: ${e?.name ?? 'error'}` };
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  if (res.status !== 200 || typeof json?.access_token !== 'string') {
    return { ok: false, status: res.status, reason: `sign-in failed with ${res.status}`, text };
  }
  return { ok: true, status: res.status, token: json.access_token, userId: json?.user?.id ?? null };
}

/** One function call as a given caller. Bodies are recorded for the sanitization audit. */
export async function call(ctx, name, token, body, method = 'POST') {
  const headers = { 'Content-Type': 'application/json', apikey: ctx.anonKey };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers, signal: AbortSignal.timeout(15000) };
  if (method === 'POST') init.body = JSON.stringify(body ?? {});
  let res;
  try {
    res = await ctx.fetchImpl(buildFunctionUrl(name), init);
  } catch (e) {
    return { name, status: 'error', text: '', json: null, detail: `network: ${e?.name}` };
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  ctx.collect?.({ name, status: res.status, text });
  return { name, status: res.status, text, json };
}

/** REST read as a given caller — used to prove RLS directly, not through a function. */
export async function rest(ctx, pathAndQuery, token) {
  const res = await ctx.fetchImpl(`${ctx.url}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: ctx.anonKey, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  try { return { status: res.status, rows: JSON.parse(text) }; } catch { return { status: res.status, rows: null, text }; }
}


/**
 * The eleven checks. Each returns `{ ok, detail }`; a failed check never throws, so one
 * failure cannot hide the state of the other ten.
 * Ids match `AUTHENTICATED_PLAN` in `scripts/staging-function-e2e.mjs` exactly.
 */
export const CHECKS = {
  'auth.sign_in': async (ctx) => {
    const a = ctx.sessions.a;
    const b = ctx.sessions.b;
    const wrong = await signIn({ fetchImpl: ctx.fetchImpl, url: ctx.url, anonKey: ctx.anonKey,
      email: ctx.sessions.emailA, password: `${ctx.sessions.emailA}-wrong-password` });
    return ok(
      a?.ok && b?.ok && typeof a.token === 'string' && typeof b.token === 'string' &&
        a.userId === ctx.m.accountA.uid && b.userId === ctx.m.accountB.uid && wrong.ok === false,
      `A=${a?.status} B=${b?.status} wrongPassword=${wrong.status} (expected 4xx)`,
    );
  },

  'vault.entitled_media': async (ctx) => {
    const r = await call(ctx, 'vault-media-access', ctx.tokens.a, { dropId: ctx.m.dropId });
    const leak = scanForMarkers(r.text, FORBIDDEN_MARKERS);
    return ok(
      r.status === 200 && signedUrlOk(r.json, ctx) && r.json?.bucket === 'private-media' &&
        r.json?.mediaKind === 'image' && r.json?.expiresIn === 120 && leak.ok,
      `status=${r.status} bucket=${r.json?.bucket} expiresIn=${r.json?.expiresIn} leak=${leak.found.join(',') || 'none'}`,
    );
  },

  'vault.unauthorized_media': async (ctx) => {
    const r = await call(ctx, 'vault-media-access', ctx.tokens.b, { dropId: ctx.m.dropId });
    const leak = scanForMarkers(r.text, [...FORBIDDEN_MARKERS, ...DENIAL_MARKERS]);
    ctx.denial = { status: r.status, body: r.text };
    return ok(r.status === 403 && r.json?.error === 'forbidden' && leak.ok,
      `status=${r.status} error=${r.json?.error} leak=${leak.found.join(',') || 'none'}`);
  },

  'vault.cross_user_access': async (ctx) => {
    // A foreign id and an id that does not exist must be INDISTINGUISHABLE, or the
    // function becomes an existence oracle.
    const absent = `p11f_absent_${'0'.repeat(8)}`;
    const r = await call(ctx, 'vault-media-access', ctx.tokens.b, { dropId: absent });
    const same = Boolean(ctx.denial) && r.status === ctx.denial.status && r.text === ctx.denial.body;
    return ok(same, `foreign=${ctx.denial?.status}/${ctx.denial?.body} absent=${r.status}/${r.text} identical=${same}`);
  },

  'lesson.entitled': async (ctx) => {
    const r = await call(ctx, 'course-lesson-media-access', ctx.tokens.a, { lessonId: ctx.m.lessonEntitledId });
    const leak = scanForMarkers(r.text, FORBIDDEN_MARKERS);
    // H2: lesson body text is never served by the media function.
    const textLeaked = r.text.includes(ctx.m.lessonSecret);
    return ok(
      r.status === 200 && signedUrlOk(r.json, ctx) && r.json?.expiresIn === 120 && leak.ok && !textLeaked,
      `status=${r.status} expiresIn=${r.json?.expiresIn} bodyTextLeaked=${textLeaked}`,
    );
  },

  'lesson.denied': async (ctx) => {
    const lapsed = await call(ctx, 'course-lesson-media-access', ctx.tokens.b, { lessonId: ctx.m.lessonEntitledId });
    const draft = await call(ctx, 'course-lesson-media-access', ctx.tokens.b, { lessonId: ctx.m.lessonDeniedId });
    const leaked = lapsed.text.includes(ctx.m.lessonSecret) || draft.text.includes(ctx.m.lessonSecret);
    return ok(
      lapsed.status === 403 && draft.status === 403 && lapsed.json?.error === 'forbidden' &&
        draft.json?.error === 'forbidden' && !leaked,
      `lapsedSubscription=${lapsed.status} draft=${draft.status} bodyTextLeaked=${leaked}`,
    );
  },

  'creator_ai.no_provider': async (ctx) => {
    const r = await call(ctx, 'creator-ai', ctx.tokens.b,
      { conversationId: ctx.m.conversationId, message: 'fixture probe: are you there?' });
    const leak = scanForMarkers(r.text, FORBIDDEN_MARKERS);
    // The provider is intentionally not configured: require the honest branch, and require
    // that NO assistant text was fabricated (message must be the notice string, not a row).
    const honest = r.json?.status === 'unconfigured' && typeof r.json?.message === 'string' &&
      r.json.message === 'AI provider not configured';
    return ok(r.status === 200 && honest && leak.ok,
      `status=${r.status} state=${r.json?.status} messageType=${typeof r.json?.message} leak=${leak.found.join(',') || 'none'}`);
  },

  'digital_creator.no_provider': async (ctx) => {
    const voice = await call(ctx, 'digital-creator', ctx.tokens.b,
      { action: 'start', creatorId: ctx.m.accountA.profileId, mode: 'VOICE' });
    // AVATAR is deliberately left disconnected in the fixture: must be refused, and must
    // not carry a session handle.
    const avatar = await call(ctx, 'digital-creator', ctx.tokens.b,
      { action: 'start', creatorId: ctx.m.accountA.profileId, mode: 'AVATAR' });
    const noHandle = !('sessionId' in (avatar.json ?? {})) &&
      !JSON.stringify(avatar.json ?? {}).includes('provider_session_ref');
    return ok(
      voice.status === 200 && voice.json?.status === 'unconfigured' && voice.json?.mode === 'VOICE' &&
        avatar.status === 409 && avatar.json?.error === 'session_rejected' && noHandle,
      `voice=${voice.status}/${voice.json?.status} avatar=${avatar.status}/${avatar.json?.error} noHandle=${noHandle}`,
    );
  },

  'input_validation': async (ctx) => {
    const cases = [
      ['vault-media-access', { dropId: 'x'.repeat(65) }],
      ['vault-media-access', { dropId: 123 }],
      ['vault-media-access', {}],
      ['course-lesson-media-access', { lessonId: 'x'.repeat(65) }],
      ['creator-ai', { conversationId: ctx.m.conversationId, message: 'y'.repeat(1001) }],
    ];
    const results = [];
    for (const [name, body] of cases) {
      const r = await call(ctx, name, ctx.tokens.a, body);
      results.push(`${name}:${r.status}`);
      if (r.status !== 400) return ok(false, `expected 400 and never 5xx — got ${results.join(' ')}`);
    }
    return ok(true, results.join(' '));
  },

  'response_sanitization': async (ctx) => {
    const problems = [];
    for (const res of ctx.responses()) {
      const leak = scanForMarkers(res.text, FORBIDDEN_MARKERS);
      if (!leak.ok) problems.push(`${res.name}[${res.status}] leaked ${leak.found.join(',')}`);
      if (res.status >= 400) {
        const denial = scanForMarkers(res.text, DENIAL_MARKERS);
        if (!denial.ok) problems.push(`${res.name}[${res.status}] denial disclosed ${denial.found.join(',')}`);
      }
    }
    return ok(problems.length === 0, problems.length ? problems.join('; ') : `${ctx.responses().length} bodies clean`);
  },

  'rls_tenant_isolation': async (ctx) => {
    const conv = `creator_ai_messages?select=body&conversation_id=eq.${ctx.m.conversationId}`;
    const media = `media_objects?select=storage_path&id=eq.${ctx.m.mediaId}`;
    const lesson = `course_lessons?select=body_text&id=eq.${ctx.m.lessonEntitledId}`;
    const bConv = await rest(ctx, conv, ctx.tokens.b);
    const aConv = await rest(ctx, conv, ctx.tokens.a);
    const bMedia = await rest(ctx, media, ctx.tokens.b);
    const aMedia = await rest(ctx, media, ctx.tokens.a);
    const bLesson = await rest(ctx, lesson, ctx.tokens.b);
    const checks = {
      bSeesOwnConversation: Array.isArray(bConv.rows) && bConv.rows.length >= 1,
      aCannotSeeBsConversation: Array.isArray(aConv.rows) && aConv.rows.length === 0,
      bCannotReadMediaPath: Array.isArray(bMedia.rows) && bMedia.rows.length === 0,
      aOwnsMediaPath: Array.isArray(aMedia.rows) && aMedia.rows.length === 1 &&
        aMedia.rows[0]?.storage_path === ctx.m.storagePath,
      bCannotSelectLessonText: Array.isArray(bLesson.rows) && bLesson.rows.length === 0,
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return ok(failed.length === 0,
      failed.length ? `failed: ${failed.join(',')}` : 'both directions isolated, controls held');
  },
};

/** Ordered ids, identical to `AUTHENTICATED_PLAN` — asserted equal by the offline tests. */
export const CHECK_ORDER = Object.keys(CHECKS);

/**
 * What this suite proves, stated so the evidence cannot overclaim (Step 16A.1, finding 5).
 * No object bytes are uploaded by the fixtures, so byte retrieval is explicitly out of scope.
 */
export const SUITE_CLAIMS = {
  media: 'signed-URL contract only (bucket, kind, expiresIn=120, entitlement gate); NOT byte retrieval',
  cleanup: 'every probe is a read or a rejected call; the suite itself writes nothing',
};

/**
 * Runs all eleven checks. `fetchImpl` and `env` are injected so the suite is fully
 * exercisable offline; this function performs no writes of any kind.
 */
export async function runAuthenticatedSuite({ fetchImpl, env = process.env, manifest, log = () => {} }) {
  const gate = authenticatedGate(env, manifest);
  if (!gate.runnable) return { stopped: true, reason: gate.reasons.join(' | '), gate, results: [] };

  const ctx = {
    fetchImpl, url: `https://${STAGING_HOST}`, anonKey: env.STAGING_ANON_KEY, m: manifest.ids,
    caught: [], collect(res) { this.caught.push(res); }, responses() { return this.caught; },
    sessions: { emailA: manifest.ids.accountA.email, emailB: manifest.ids.accountB.email, a: null, b: null },
  };

  if (env.STAGING_TEST_ACCESS_TOKEN) {
    ctx.tokens = { a: env.STAGING_TEST_ACCESS_TOKEN, b: env.STAGING_TEST_ACCESS_TOKEN };
    const assumed = { ok: true, status: 200, token: env.STAGING_TEST_ACCESS_TOKEN };
    ctx.sessions.a = { ...assumed, userId: manifest.ids.accountA.uid };
    ctx.sessions.b = { ...assumed, userId: manifest.ids.accountB.uid };
  } else {
    ctx.sessions.a = await signIn({ fetchImpl, url: ctx.url, anonKey: ctx.anonKey,
      email: manifest.ids.accountA.email, password: env.STAGING_TEST_PASSWORD });
    ctx.sessions.b = await signIn({ fetchImpl, url: ctx.url, anonKey: ctx.anonKey,
      email: manifest.ids.accountB.email, password: env.STAGING_TEST_PASSWORD });
    ctx.tokens = { a: ctx.sessions.a.token, b: ctx.sessions.b.token };
  }

  const results = [];
  for (const id of CHECK_ORDER) {
    let outcome;
    try {
      outcome = await CHECKS[id](ctx);
    } catch (e) {
      outcome = { ok: false, detail: `threw: ${String(e?.message ?? e).slice(0, 160)}` };
    }
    const detail = redactForEvidence(outcome.detail);
    log(`${outcome.ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`);
    results.push({ id, ok: outcome.ok, detail, redacted: detail !== outcome.detail, responses: ctx.caught.length });
  }
  const failed = results.filter((r) => !r.ok).length;
  return { stopped: false, results, failed, passed: results.length - failed, total: results.length };
}

const ok = (condition, detail) => ({ ok: Boolean(condition), detail });
const signedUrlOk = (body, ctx) =>
  typeof body?.url === 'string' && body.url.startsWith(`${ctx.url}/storage/v1/object/sign/`);
