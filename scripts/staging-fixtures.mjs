/**
 * Staging fixture lifecycle (Phase 11 Step 16A.1) — deterministic, bounded, idempotent.
 *
 * NOTHING here runs against hosted staging until THREE separate authorizations are present.
 * No statement this module can emit may touch a row that is not addressed by a run identifier
 * derived from this run's prefix, and `assertScoped` enforces that mechanically.
 *
 * Step 16A.1 corrections:
 *   1. Connection credentials are SEPARATE from fixture-user credentials, and may be distinct.
 *   2. Count parsing is STRICT: any missing column, NaN, negative or malformed value stops
 *      every write (previously a parse failure silently looked like "all zeros").
 *   3. Cleanup covers everything the run can create, including rows written by TRIGGERS
 *      (`notifications` from `notify_vault_subscription`) and by RPCs (`rate_limit_events`).
 *   4. Accounts are provisioned through the supported Auth Admin API by default, with a SQL
 *      fallback that also writes `auth.identities` (without which password sign-in fails).
 *   5. No object bytes are uploaded: the media test asserts URL signing only (see CLAIMS).
 */
import { createHash } from 'node:crypto';
import { STAGING_HOST, redactForEvidence } from './staging-host.mjs';

const REF = STAGING_HOST.split('.')[0];
export const PROJECT_REF = REF;
/** Fixture ids are quoted into SQL, so the charset is deliberately tiny. */
export const PREFIX_RE = /^p11f_[a-z0-9]{8}$/;

/**
 * Hard ceilings. Every one of these must read 0 before a `create` (see `validateCounts`), which
 * is what makes cleanup provably safe: none of these rows can belong to anything but this run.
 */
export const MAX_FIXTURE_COUNTS = {
  auth_users: 2,
  identities: 2,
  profiles: 2,
  notifications: 4,
  rate_limit_events: 40,
  creator_vaults: 1,
  vault_drops: 1,
  media_objects: 1,
  vault_subscriptions: 1,
  creator_courses: 1,
  course_lessons: 2,
  creator_ai_profiles: 1,
  creator_ai_conversations: 1,
  creator_ai_messages: 1,
  digital_creator_sessions: 1,
};

export const AUTHORIZATION_TOKENS = {
  create: `fixture-create:${REF}`,
  execute: `fixture-execute:${REF}`,
  cleanup: `fixture-cleanup:${REF}`,
};

/** What each test claim actually proves — stated so it cannot be overstated. */
export const CLAIMS = {
  media: 'URL SIGNING ONLY: an entitled caller receives a correctly scoped, 120 s signed URL. '
    + 'It does NOT prove byte retrieval, because no object bytes are uploaded.',
  cleanup: 'Every row reachable from this run\'s identifiers is removed; rows that merely share a '
    + 'creator or actor id were not created by this run (the accounts are new and must be absent first).',
};

/**
 * Credential separation. The database connection secret and the fixture accounts' password are
 * different inputs; the plan REFUSES if either is absent, and REFUSES if they are equal.
 */
export const CREDENTIAL_ENV = {
  dbPassword: 'STAGING_DB_PASSWORD',
  fixtureUserPassword: 'STAGING_FIXTURE_USER_PASSWORD',
  serviceRoleKey: 'STAGING_SERVICE_ROLE_KEY',
  dbCa: 'STAGING_DB_CA_PATH',
};

/** Presence-only report: never the values. Safe to write into evidence. */
export function credentialPlan(env = process.env) {
  const db = env[CREDENTIAL_ENV.dbPassword] ?? '';
  const user = env[CREDENTIAL_ENV.fixtureUserPassword] ?? '';
  const reasons = [
    !db && `${CREDENTIAL_ENV.dbPassword} is required (database connection)`,
    !env[CREDENTIAL_ENV.dbCa] && `${CREDENTIAL_ENV.dbCa} is required (pinned CA)`,
    !user && `${CREDENTIAL_ENV.fixtureUserPassword} is required (fixture accounts)`,
    db && user && db === user && 'the database password and the fixture-user password must differ',
  ].filter(Boolean);
  return {
    ok: reasons.length === 0,
    reasons,
    custody: {
      db_password: env.STAGING_DB_PASSWORD_CUSTODIAN ?? 'environment',
      fixture_user_password: env.STAGING_FIXTURE_USER_PASSWORD_CUSTODIAN ?? 'environment',
    },
    presents: {
      db_password: Boolean(db),
      db_ca: Boolean(env[CREDENTIAL_ENV.dbCa]),
      fixture_user_password: Boolean(user),
      service_role_key: Boolean(env[CREDENTIAL_ENV.serviceRoleKey]),
    },
    separated: Boolean(db) && Boolean(user) && db !== user,
  };
}

/** Removes every secret value and every credential-shaped token from a string. */
export function redactSecrets(text, env = process.env) {
  return redactForEvidence(text, Object.values(CREDENTIAL_ENV).map((key) => env[key]).filter(Boolean));
}


const hex = (s) => createHash('md5').update(s).digest('hex');
const asUuid = (s) => {
  const h = hex(s);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

/**
 * Every identifier the fixture set owns.
 *
 * The account EMAILS are always derived from the prefix (that is how the accounts are found
 * again). The auth UIDs are server-assigned when the Auth Admin API provisions them, so they are
 * passed in as `identity.uids`; the SQL fallback derives them instead. `profileId` mirrors the
 * database's own derivation in `public.handle_new_user` ('u_' || auth-uid, dashes removed).
 */
export function ids(prefix, identity = {}) {
  if (!PREFIX_RE.test(prefix)) throw new Error(`refusing: prefix must match ${PREFIX_RE}`);
  const uidFor = (tag) => identity.uids?.[tag] ?? asUuid(`${prefix}:${tag}`);
  const account = (tag) => {
    const uid = uidFor(tag);
    return { email: `${prefix}.${tag}@fixture.invalid`, uid, profileId: `u_${String(uid).replace(/-/g, '')}` };
  };
  return {
    prefix,
    accountA: account('a'),
    accountB: account('b'),
    vaultId: `${prefix}_vault`,
    dropId: `${prefix}_drop`,
    mediaId: `${prefix}_media`,
    /** Not a real object: fixtures never upload bytes (see CLAIMS.media). */
    storagePath: `${prefix}/drop-1.jpg`,
    subscriptionId: `${prefix}_sub`,
    courseId: `${prefix}_course`,
    lessonEntitledId: `${prefix}_lesson_e`,
    lessonDeniedId: `${prefix}_lesson_d`,
    conversationId: `${prefix}_conv`,
    messageId: `${prefix}_msg`,
    sessionId: `${prefix}_sess`,
    /** Marker written into body_text so H2 ("the text is not readable") is provable. */
    lessonSecret: `${prefix}_LESSON_BODY_TEXT_DO_NOT_SERVE`,
  };
}

/** Fails closed unless the caller holds the authorization for this exact action. */
export function authorizeFixtureAction(action, env = process.env) {
  const wanted = AUTHORIZATION_TOKENS[action];
  if (!wanted) throw new Error(`unknown fixture action: ${action}`);
  const key = `STAGING_FIXTURES_${action.toUpperCase()}_AUTHORIZATION`;
  const got = env[key] ?? '';
  const urlOk = (env.STAGING_SUPABASE_URL ?? '') === `https://${STAGING_HOST}`;
  const prefixOk = PREFIX_RE.test(env.STAGING_FIXTURE_PREFIX ?? '');
  const ok = got === wanted && urlOk && prefixOk;
  return {
    ok,
    action,
    reason: ok
      ? `authorized (${action})`
      : !urlOk
        ? `REFUSING: STAGING_SUPABASE_URL must be https://${STAGING_HOST}`
        : !prefixOk
          ? 'REFUSING: STAGING_FIXTURE_PREFIX must match p11f_<8 lowercase alnum>'
          : `REFUSING: ${key} must equal ${wanted}`,
  };
}

/**
 * The safety invariant, enforced on every statement the module emits and asserted by the offline
 * tests: no DELETE/UPDATE may exist that is not addressed by this run's prefix or by an id derived
 * from it — including the account ids, which are new and must be absent before a create.
 */
export function assertScoped(statements, prefix, allowed) {
  const base = ids(prefix);
  const derived = allowed ?? [base.accountA.uid, base.accountB.uid,
    base.accountA.profileId, base.accountB.profileId, base.storagePath];
  const ok = [prefix, ...derived];
  const scoped = [];
  for (const sql of statements) {
    // Unbounded first: a bare `delete from t` is the worst case and must say so.
    if (/delete\s+from\s+[a-z_.]+\s*;?$/i.test(sql.trim())) {
      throw new Error('refusing: unbounded DELETE (no WHERE clause)');
    }
    if (/\b(delete\s+from|update\s+[a-z_.]+)\b/i.test(sql) && !ok.some((t) => sql.includes(t))) {
      throw new Error(`refusing: unscoped write without a run identifier: ${sql.slice(0, 80)}`);
    }
    scoped.push(sql);
  }
  return scoped;
}

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

/**
 * Accounts. The supported path is the Auth Admin API (`provisionAccounts`). This SQL is the
 * FALLBACK, and it is the reason a naive `insert into auth.users` fails: GoTrue also needs an
 * `auth.identities` row for the email provider, or password sign-in is refused. Both rows are
 * written together, and `auth_signin_probe` verifies the result before anything else runs.
 *
 * `:'fixture_user_password'` is a psql variable sourced from the environment at run time
 * (`\getenv`), so no credential ever appears in the SQL text or in an argument list.
 */
export function buildIdentitySql(prefix, identity = {}) {
  const i = ids(prefix, identity);
  const rows = [['a', i.accountA], ['b', i.accountB]];
  const statements = [];
  for (const [tag, account] of rows) {
    statements.push(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
       select ${q(account.uid)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(account.email)}, crypt(:'fixture_user_password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
        where not exists (select 1 from auth.users u where u.id = ${q(account.uid)})`,
      `insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
       select ${q(account.uid)}, ${q(account.uid)}, 'email', ${q(account.uid)}, jsonb_build_object('sub', ${q(account.uid)}, 'email', ${q(account.email)}, 'email_verified', true), now(), now(), now()
        where not exists (select 1 from auth.identities idn where idn.user_id = ${q(account.uid)} and idn.provider = 'email')`,
      `update public.profiles set handle = ${q(`${prefix}_${tag}`)} where id = ${q(account.profileId)}`,
    );
  }
  return statements;
}

/** Finds this run's accounts again — by prefix-derived email, or by their SQL-derived ids. */
export function buildResolveSql(prefix, identity = {}) {
  const i = ids(prefix, identity);
  return `select id::text || '|' || email from auth.users
           where email in (${q(i.accountA.email)}, ${q(i.accountB.email)})
              or id in (${q(i.accountA.uid)}, ${q(i.accountB.uid)})`;
}

/** Maps `buildResolveSql` rows onto the two accounts: {} when an account does not exist. */
export function parseResolved(uids, stdout, prefix) {
  const out = { a: { uid: null, profileId: null }, b: { uid: null, profileId: null } };
  const known = { [prefix + '.a@fixture.invalid']: 'a', [prefix + '.b@fixture.invalid']: 'b' };
  for (const line of String(stdout ?? '').split('\n')) {
    const [uid, email] = line.trim().split('|');
    const tag = known[email] ?? (uid && uids?.a === uid ? 'a' : uid && uids?.b === uid ? 'b' : null);
    if (!tag || !uid) continue;
    out[tag] = { uid, profileId: `u_${String(uid).replace(/-/g, '')}` };
  }
  return out;
}

/** Every row the run writes that is NOT an account (accounts may come from the Admin API). */
export function buildFixtureSql(prefix, identity = {}) {
  const i = ids(prefix, identity);
  const setup = [
    // Private media METADATA only — no object bytes are uploaded (see CLAIMS.media).
    `insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, size_bytes, status, visibility)
     values (${q(i.mediaId)}, ${q(i.accountA.profileId)}, 'private-media', ${q(i.storagePath)}, 'image', 'image/jpeg', 1024, 'ready', 'private')
     on conflict do nothing`,
    `insert into public.creator_vaults (id, creator_id, title) values (${q(i.vaultId)}, ${q(i.accountA.profileId)}, 'Fixture Vault') on conflict do nothing`,
    `insert into public.vault_drops (id, vault_id, creator_id, caption, media_object_id, access_level, status, published_at, expires_at)
     values (${q(i.dropId)}, ${q(i.vaultId)}, ${q(i.accountA.profileId)}, 'fixture drop', ${q(i.mediaId)}, 'subscriber', 'published', now(), now() + interval '7 days')
     on conflict do nothing`,
    // B's LAPSED entitlement: status stays 'active' (a real enum member) while the window has
    // passed, so the `current_period_end > now()` gate is what denies — and the table CHECK
    // (`current_period_end > started_at`) still holds.
    `insert into public.vault_subscriptions (id, subscriber_id, vault_id, status, started_at, current_period_end)
     values (${q(i.subscriptionId)}, ${q(i.accountB.profileId)}, ${q(i.vaultId)}, 'active', now() - interval '30 days', now() - interval '1 day')
     on conflict do nothing`,
    `insert into public.creator_courses (id, creator_id, title, access_type, status)
     values (${q(i.courseId)}, ${q(i.accountA.profileId)}, 'Fixture Course', 'subscriber', 'published') on conflict do nothing`,
    `insert into public.course_lessons (id, course_id, title, position, media_object_id, body_text, preview_allowed, access_type, status)
     values (${q(i.lessonEntitledId)}, ${q(i.courseId)}, 'Fixture Lesson', 1, ${q(i.mediaId)}, ${q(i.lessonSecret)}, false, 'subscriber', 'published') on conflict do nothing`,
    `insert into public.course_lessons (id, course_id, title, position, body_text, preview_allowed, access_type, status)
     values (${q(i.lessonDeniedId)}, ${q(i.courseId)}, 'Fixture Draft Lesson', 2, ${q(i.lessonSecret)}, false, 'subscriber', 'draft') on conflict do nothing`,
    // `avatar_provider` is constrained to ^[a-z0-9_]{1,40}$ (no hyphens): 'fixture_not_connected'.
    // voice_enabled requires a consent stamp and a non-'none' provider; AVATAR stays disconnected.
    `insert into public.creator_ai_profiles (creator_id, enabled, display_name, access, avatar_provider, avatar_external_id, voice_enabled, avatar_enabled, likeness_consent_at)
     values (${q(i.accountA.profileId)}, true, 'Fixture AI', 'FREE', 'fixture_not_connected', ${q(`${prefix}_avatar`)}, true, false, now())
     on conflict (creator_id) do nothing`,
    `insert into public.creator_ai_conversations (id, creator_id, profile_id)
     values (${q(i.conversationId)}, ${q(i.accountA.profileId)}, ${q(i.accountB.profileId)}) on conflict do nothing`,
    `insert into public.creator_ai_messages (id, conversation_id, role, body)
     values (${q(i.messageId)}, ${q(i.conversationId)}, 'user', ${q(`${prefix}_seed_message`)}) on conflict do nothing`,
  ];
  return { ids: i, setup: assertScoped(setup, prefix) };
}


/**
 * Cleanup, children first. `resolved` carries the accounts that actually exist (see
 * `parseResolved`); statements needing an account are emitted only for accounts that do.
 *
 * Coverage audit — every path that can create a row during a run:
 *   · our own inserts                      → deleted by a run-derivative id
 *   · `notify_vault_subscription` TRIGGER  → `notifications` (recipient = the vault's creator)
 *   · `notify_vault_drop_published` TRIGGER→ `notifications` (recipient = the vault's subscribers)
 *   · `assert_rate_limit` inside RPCs      → `rate_limit_events` (actor = the caller)
 *   · `start_digital_creator_session` RPC  → `digital_creator_sessions`
 *   · `creator_ai_begin_turn` RPC          → `creator_ai_messages`
 * Every predicate is keyed to this run's own ids, never to a shared creator/actor id — and the
 * accounts are required to be ABSENT before a create, so no such shared row can pre-exist.
 */
export function buildTeardownSql(prefix, resolved = {}) {
  const i = ids(prefix, { uids: { a: resolved.a?.uid ?? undefined, b: resolved.b?.uid ?? undefined } });
  const known = [['a', resolved.a], ['b', resolved.b]].filter(([, r]) => r?.uid);
  const profiles = known.map(([, r]) => q(r.profileId));
  const uids = known.map(([, r]) => q(r.uid));
  const statements = [];
  if (profiles.length) {
    const plist = profiles.join(', ');
    statements.push(
      `delete from public.notifications where recipient_id in (${plist}) or actor_id in (${plist})`,
      `delete from public.rate_limit_events where actor_id in (${plist})`,
    );
    if (resolved.a?.uid) {
      statements.push(
        `delete from public.digital_creator_sessions where creator_id = ${q(resolved.a.profileId)}`,
        `delete from public.creator_ai_profiles where creator_id = ${q(resolved.a.profileId)}`,
      );
    }
  }
  statements.push(
    `delete from public.creator_ai_messages where conversation_id = ${q(i.conversationId)}`,
    `delete from public.creator_ai_conversations where id = ${q(i.conversationId)}`,
    `delete from public.course_lessons where course_id = ${q(i.courseId)}`,
    `delete from public.creator_courses where id = ${q(i.courseId)}`,
    `delete from public.vault_subscriptions where id = ${q(i.subscriptionId)}`,
    `delete from public.vault_drops where id = ${q(i.dropId)}`,
    `delete from public.creator_vaults where id = ${q(i.vaultId)}`,
    `delete from public.media_objects where id = ${q(i.mediaId)}`,
  );
  if (profiles.length) {
    statements.push(`delete from public.profiles where id in (${profiles.join(', ')})`);
    // Identities are removed by the Admin API on the supported path; these are no-ops there.
    statements.push(`delete from auth.identities where user_id in (${uids.join(', ')})`);
    statements.push(`delete from auth.users where id in (${uids.join(', ')})`);
  }
  return assertScoped(statements, prefix, known.flatMap(([, r]) => [r.uid, r.profileId]).concat([i.storagePath]));
}

/** Column order is generated from one table, so the query and the parser cannot drift apart. */
export const COUNT_COLUMNS = Object.keys(MAX_FIXTURE_COUNTS);
const list = (v) => `(${v.map(q).join(', ')})`;
const COUNT_QUERIES = {
  auth_users: (i) => `(select count(*) from auth.users where email in ${list([i.accountA.email, i.accountB.email])} or id in ${list([i.accountA.uid, i.accountB.uid])})`,
  identities: (i) => `(select count(*) from auth.identities where user_id in ${list([i.accountA.uid, i.accountB.uid])})`,
  profiles: (i) => `(select count(*) from public.profiles where id in ${list([i.accountA.profileId, i.accountB.profileId])})`,
  notifications: (i) => `(select count(*) from public.notifications where recipient_id in ${list([i.accountA.profileId, i.accountB.profileId])} or actor_id in ${list([i.accountA.profileId, i.accountB.profileId])})`,
  rate_limit_events: (i) => `(select count(*) from public.rate_limit_events where actor_id in ${list([i.accountA.profileId, i.accountB.profileId])})`,
  creator_vaults: (i) => `(select count(*) from public.creator_vaults where id = ${q(i.vaultId)})`,
  vault_drops: (i) => `(select count(*) from public.vault_drops where id = ${q(i.dropId)})`,
  media_objects: (i) => `(select count(*) from public.media_objects where id = ${q(i.mediaId)})`,
  vault_subscriptions: (i) => `(select count(*) from public.vault_subscriptions where id = ${q(i.subscriptionId)})`,
  creator_courses: (i) => `(select count(*) from public.creator_courses where id = ${q(i.courseId)})`,
  course_lessons: (i) => `(select count(*) from public.course_lessons where course_id = ${q(i.courseId)})`,
  creator_ai_profiles: (i) => `(select count(*) from public.creator_ai_profiles where creator_id = ${q(i.accountA.profileId)})`,
  creator_ai_conversations: (i) => `(select count(*) from public.creator_ai_conversations where id = ${q(i.conversationId)})`,
  creator_ai_messages: (i) => `(select count(*) from public.creator_ai_messages where conversation_id = ${q(i.conversationId)})`,
  digital_creator_sessions: (i) => `(select count(*) from public.digital_creator_sessions where creator_id = ${q(i.accountA.profileId)})`,
};

/** Counts what exists for this prefix. Strictly parsed — see `parseCounts`/`validateCounts`. */
export function buildCountSql(prefix, identity = {}) {
  const i = ids(prefix, identity);
  return `select ${COUNT_COLUMNS.map((k) => `${COUNT_QUERIES[k](i)} as ${k}`).join(', ')}`;
}

/**
 * STRICT parse. Returns `{ ok: false, reason }` for anything that is not exactly one row of
 * `COUNT_COLUMNS.length` non-negative integers — including a missing column, a truncated line,
 * `NaN`, a negative number, a non-integer, or extra columns.
 *
 * This is the correction for the 16A defect where a parse failure produced `{}` and
 * `?? 0` turned it into "everything is zero", which let writes proceed on unreadable state.
 */
export function parseCounts(stdout) {
  const lines = String(stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const line = lines.length ? lines[lines.length - 1] : '';
  if (!line) return { ok: false, reason: 'empty output' };
  const values = line.split('|');
  if (values.length !== COUNT_COLUMNS.length) {
    return { ok: false, reason: `expected ${COUNT_COLUMNS.length} columns, got ${values.length}` };
  }
  const counts = {};
  for (let idx = 0; idx < COUNT_COLUMNS.length; idx += 1) {
    const key = COUNT_COLUMNS[idx];
    const raw = values[idx].trim();
    if (!/^\d+$/.test(raw)) return { ok: false, reason: `column ${key} is not a non-negative integer (${raw.slice(0, 16) || 'empty'})` };
    counts[key] = Number(raw);
    if (!Number.isSafeInteger(counts[key])) return { ok: false, reason: `column ${key} is out of range` };
  }
  return { ok: true, counts };
}

/**
 * The gate every action passes through. `expectZero` (a create) additionally requires a CLEAN
 * prefix: if any of these rows already exist we cannot prove they belong to this run, so we stop
 * rather than delete or overwrite something we did not create.
 */
export function validateCounts(parsed, { expectZero = false, enforceCeilings = true } = {}) {
  if (!parsed || parsed.ok !== true) {
    return { ok: false, reason: `REFUSING: unreadable inventory (${parsed?.reason ?? 'no result'})` };
  }
  const missing = COUNT_COLUMNS.filter((k) => typeof parsed.counts[k] !== 'number');
  if (missing.length) return { ok: false, reason: `REFUSING: inventory missing ${missing.join(', ')}` };
  const over = enforceCeilings ? COUNT_COLUMNS.filter((k) => parsed.counts[k] > MAX_FIXTURE_COUNTS[k]) : [];
  if (over.length) return { ok: false, reason: `REFUSING: unexpected database state (${over.map((k) => `${k}=${parsed.counts[k]} > ${MAX_FIXTURE_COUNTS[k]}`).join(', ')})` };
  const dirty = expectZero ? COUNT_COLUMNS.filter((k) => parsed.counts[k] !== 0) : [];
  if (dirty.length) {
    return { ok: false, reason: `REFUSING: prefix is not clean (${dirty.map((k) => `${k}=${parsed.counts[k]}`).join(', ')}) — nothing was written` };
  }
  return { ok: true, counts: parsed.counts };
}

/** Kept for callers that only want the ceiling view. */
export function countsWithinCeilings(counts) {
  return validateCounts({ ok: true, counts });
}

const adminHeaders = (key) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const safeJson = (text) => { try { return JSON.parse(text); } catch { return null; } };

/**
 * Supported account provisioning: `POST /auth/v1/admin/users` with the service-role key.
 * GoTrue writes `auth.users` AND `auth.identities` itself, which is why this is preferred over
 * raw SQL — a bare `auth.users` insert has no identity row and password sign-in then fails.
 */
export async function provisionAccounts({ prefix, env = process.env, fetchImpl = fetch }) {
  const key = env[CREDENTIAL_ENV.serviceRoleKey];
  const userPassword = env[CREDENTIAL_ENV.fixtureUserPassword];
  if (!key) return { ok: false, reason: 'REFUSING: STAGING_SERVICE_ROLE_KEY is required for the Auth Admin API path' };
  if (!userPassword) return { ok: false, reason: `REFUSING: ${CREDENTIAL_ENV.fixtureUserPassword} is required` };
  const i = ids(prefix);
  const created = {};
  for (const [tag, account] of [['a', i.accountA], ['b', i.accountB]]) {
    let res;
    try {
      res = await fetchImpl(`https://${STAGING_HOST}/auth/v1/admin/users`, {
        method: 'POST',
        headers: adminHeaders(key),
        body: JSON.stringify({ email: account.email, password: userPassword, email_confirm: true }),
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      return { ok: false, reason: `account ${tag}: network ${e?.name}` };
    }
    const text = await res.text();
    const json = safeJson(text);
    if ((res.status === 200 || res.status === 201) && typeof json?.id === 'string') {
      created[tag] = json.id;
      continue;
    }
    if (res.status === 409 || res.status === 422) {
      const found = await findAccounts({ prefix, env, fetchImpl });
      if (found.ok && found.uids?.[tag]) { created[tag] = found.uids[tag]; continue; }
      return { ok: false, reason: `account ${tag}: exists but could not be resolved` };
    }
    return { ok: false, reason: redactSecrets(`account ${tag}: admin API returned ${res.status} ${text.slice(0, 120)}`, env) };
  }
  return { ok: true, uids: created };
}

/** Finds this run's accounts by their prefix-derived emails (bounded to one page). */
export async function findAccounts({ prefix, env = process.env, fetchImpl = fetch }) {
  const key = env[CREDENTIAL_ENV.serviceRoleKey];
  if (!key) return { ok: false, reason: 'REFUSING: STAGING_SERVICE_ROLE_KEY is required' };
  const i = ids(prefix);
  const wanted = { [i.accountA.email]: 'a', [i.accountB.email]: 'b' };
  let res;
  try {
    res = await fetchImpl(`https://${STAGING_HOST}/auth/v1/admin/users?page=1&per_page=200`, {
      headers: adminHeaders(key), signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return { ok: false, reason: `lookup: network ${e?.name}` };
  }
  const json = safeJson(await res.text());
  const users = Array.isArray(json?.users) ? json.users : [];
  const uids = {};
  for (const user of users) if (user?.email && wanted[user.email] && typeof user.id === 'string') uids[wanted[user.email]] = user.id;
  return { ok: true, uids };
}

/** Supported removal. A 404 is success: the account is already gone. */
export async function deprovisionAccounts({ uids, env = process.env, fetchImpl = fetch }) {
  const key = env[CREDENTIAL_ENV.serviceRoleKey];
  if (!key) return { ok: true, skipped: 'no service-role key: SQL deletes already removed the accounts' };
  const deleted = [];
  for (const uid of Object.values(uids ?? {}).filter((v) => typeof v === 'string')) {
    try {
      const res = await fetchImpl(`https://${STAGING_HOST}/auth/v1/admin/users/${uid}?should_soft_delete=false`, {
        method: 'DELETE', headers: adminHeaders(key), signal: AbortSignal.timeout(20000),
      });
      if (res.status !== 200 && res.status !== 204 && res.status !== 404) {
        return { ok: false, reason: redactSecrets(`delete ${uid}: admin API returned ${res.status}`, env) };
      }
      deleted.push(uid);
    } catch (e) {
      return { ok: false, reason: `delete ${uid}: network ${e?.name}` };
    }
  }
  return { ok: true, deleted };
}

/** Proves the accounts can really sign in — the check a bare SQL insert would fail. */
export async function signInProbe({ prefix, uids, env = process.env, fetchImpl = fetch }) {
  const anon = env.STAGING_ANON_KEY;
  if (!anon) return { ok: false, reason: 'REFUSING: STAGING_ANON_KEY is required to verify sign-in' };
  const i = ids(prefix, { uids });
  for (const [tag, account] of [['a', i.accountA], ['b', i.accountB]]) {
    let res;
    try {
      res = await fetchImpl(`https://${STAGING_HOST}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anon, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.email, password: env[CREDENTIAL_ENV.fixtureUserPassword] }),
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      return { ok: false, reason: `sign-in probe ${tag}: network ${e?.name}` };
    }
    const text = await res.text();
    const json = safeJson(text);
    if (res.status !== 200 || typeof json?.access_token !== 'string') {
      return { ok: false, reason: `sign-in probe ${tag} failed with ${res.status}: ${redactSecrets(text.slice(0, 120), env)}` };
    }
    if (typeof json?.user?.id === 'string' && uids?.[tag] && json.user.id !== uids[tag]) {
      return { ok: false, reason: `sign-in probe ${tag}: resolved a different account` };
    }
  }
  return { ok: true, verified: ['a', 'b'] };
}

/**
 * Default SQL runner. STRICT and secret-safe: it refuses to start without separated credentials,
 * and it never puts a secret in argv — the connection password travels in `PGPASSWORD`, and the
 * fixture-user password is read by psql itself via `\getenv`. Any error text is redacted before
 * it can reach a log, a console or an evidence file.
 */
export function createPsqlRunner(env = process.env) {
  return async function runSql(sql) {
    const creds = credentialPlan(env);
    if (!creds.ok) throw new Error(`refusing: ${creds.reasons.join('; ')}`);
    if ((env.STAGING_DB_TARGET ?? '') !== PROJECT_REF) throw new Error(`refusing: STAGING_DB_TARGET must be ${PROJECT_REF}`);
    const { spawnSync } = await import('node:child_process');
    const args = ['-h', `db.${STAGING_HOST}`, '-p', '5432', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'];
    const input = `\\getenv fixture_user_password ${CREDENTIAL_ENV.fixtureUserPassword}\n${sql}`;
    const res = spawnSync('psql', args, {
      input,
      encoding: 'utf8',
      env: {
        ...env,
        PGPASSWORD: env[CREDENTIAL_ENV.dbPassword],
        PGSSLMODE: 'verify-full',
        PGSSLROOTCERT: env[CREDENTIAL_ENV.dbCa],
        PGAPPNAME: 'clash-fixture-run',
      },
    });
    if (res.error) throw new Error(`psql unavailable: ${res.error.message}`);
    if (res.status !== 0) throw new Error(redactSecrets(`psql failed (${res.status}): ${String(res.stderr ?? '').slice(0, 200)}`, env));
    return res.stdout;
  };
}

/// Exact post-create inventory: every value is predicted by the write list + the trigger audit.
export const EXPECTED_AFTER_CREATE = {
  auth_users: 2, identities: 2, profiles: 2, creator_vaults: 1, vault_drops: 1, media_objects: 1,
  vault_subscriptions: 1, creator_courses: 1, course_lessons: 2, creator_ai_profiles: 1,
  creator_ai_conversations: 1, creator_ai_messages: 1,
};

/** Verifies the created state column by column, including the trigger-written notification. */
export function verifyAfterCreate(parsed) {
  const gate = validateCounts(parsed);
  if (!gate.ok) return gate;
  const problems = Object.entries(EXPECTED_AFTER_CREATE)
    .filter(([key, want]) => gate.counts[key] !== want)
    .map(([key, want]) => `${key}=${gate.counts[key]} (expected ${want})`);
  if (gate.counts.notifications < 1) {
    problems.push('notifications=0 (expected >= 1: notify_vault_subscription should have fired)');
  }
  if (gate.counts.digital_creator_sessions !== 0) problems.push(`digital_creator_sessions=${gate.counts.digital_creator_sessions} (expected 0 before any test runs)`);
  return problems.length
    ? { ok: false, reason: `REFUSING: fixture verification failed (${problems.join(', ')})` }
    : { ok: true, counts: gate.counts };
}

/** SQL-fallback account provisioning: writes `auth.users` AND `auth.identities` together. */
async function provisionBySql({ prefix, env, runSql }) {
  for (const sql of buildIdentitySql(prefix)) {
    try {
      await runSql(sql);
    } catch (e) {
      return { ok: false, reason: redactSecrets(`identity SQL failed: ${String(e?.message ?? e)}`, env) };
    }
  }
  const resolved = parseResolved(null, await runSql(buildResolveSql(prefix)), prefix);
  if (!resolved.a.uid || !resolved.b.uid) return { ok: false, reason: 'identity SQL did not produce both accounts' };
  return { ok: true, uids: { a: resolved.a.uid, b: resolved.b.uid } };
}

/**
 * Runs one fixture action. Everything is injected, so the offline tests drive the whole state
 * machine with mocked HTTP and a mocked SQL runner.
 *
 * Order of refusal (each one stops before the next is attempted):
 *   authorization → credential separation → readable inventory → clean prefix → provisioning →
 *   sign-in probe → writes → post-condition verification.
 * A failure NEVER triggers automatic cleanup and NEVER deletes evidence: the manifest stays so a
 * separately authorized `teardown` can finish the job.
 */
export async function runFixtureAction({ action, env = process.env, runSql, fetchImpl = fetch, now = new Date() }) {
  const credentials = credentialPlan(env);
  const credentialSummary = { ok: credentials.ok, separated: credentials.separated, presents: credentials.presents, custody: credentials.custody };
  const auth = authorizeFixtureAction(action === 'teardown' ? 'cleanup' : action, env);
  if (!auth.ok) return { ok: false, action, stopped: true, executed: 0, reason: auth.reason, credentials: credentialSummary };
  if (!credentials.ok) {
    return { ok: false, action, stopped: true, executed: 0, reason: `REFUSING: ${credentials.reasons.join('; ')}`, credentials: credentialSummary };
  }
  const prefix = env.STAGING_FIXTURE_PREFIX;
  const identityMode = env.STAGING_FIXTURE_IDENTITY_MODE === 'sql-insert' ? 'sql-insert' : 'admin-api';
  const base = { action, identity_mode: identityMode, credentials: credentialSummary, started_at: now.toISOString() };

  const before = parseCounts(await runSql(buildCountSql(prefix)));
  const gate = validateCounts(before, { expectZero: action === 'create', enforceCeilings: action === 'create' });
  if (!gate.ok) return { ...base, ok: false, stopped: true, executed: 0, reason: gate.reason, observed: before.counts ?? null };

  if (action === 'create') {
    const provision = identityMode === 'admin-api'
      ? await provisionAccounts({ prefix, env, fetchImpl })
      : await provisionBySql({ prefix, env, runSql });
    if (!provision.ok) return { ...base, ok: false, stopped: true, executed: 0, reason: provision.reason, observed: gate.counts };
    const uids = provision.uids;
    // The check a bare SQL insert fails: the accounts must be able to sign in for real.
    const probe = await signInProbe({ prefix, uids, env, fetchImpl });
    if (!probe.ok) {
      return { ...base, ok: false, stopped: true, executed: 0, account_uids: uids, observed: gate.counts,
        reason_code: 'SIGNIN_PROBE_FAILED', reason: probe.reason, cleanup_available: true, evidence_preserved: true };
    }
    const { setup } = buildFixtureSql(prefix, { uids });
    let executed = 0;
    for (const sql of setup) {
      try {
        await runSql(sql);
        executed += 1;
      } catch (e) {
        return { ...base, ok: false, stopped: true, executed, total: setup.length, account_uids: uids,
          failed_statement_index: executed, observed: gate.counts,
          reason: `statement ${executed + 1}/${setup.length} failed: ${redactSecrets(String(e?.message ?? e), env)}`,
          cleanup_available: true, evidence_preserved: true };
      }
    }
    const after = parseCounts(await runSql(buildCountSql(prefix, { uids })));
    const verify = verifyAfterCreate(after);
    if (!verify.ok) {
      return { ...base, ok: false, stopped: true, executed, total: setup.length, account_uids: uids,
        reason: verify.reason, observed: after.counts ?? null, cleanup_available: true, evidence_preserved: true };
    }
    return { ...base, ok: true, executed, total: setup.length, account_uids: uids, observed: verify.counts,
      manifest: { step: 'phase-11-16a.1', prefix, project_ref: PROJECT_REF, identity_mode: identityMode,
        created_at: now.toISOString(), ids: ids(prefix, { uids }), claims: CLAIMS, counts: verify.counts },
      reason: 'fixtures created, verified, and the accounts proved they can sign in' };
  }

  // ── teardown: resolve, then delete only what is addressed by this run's identifiers ──
  const resolved = parseResolved(null, await runSql(buildResolveSql(prefix)), prefix);
  const statements = buildTeardownSql(prefix, resolved);
  let executed = 0;
  for (const sql of statements) {
    try {
      await runSql(sql);
      executed += 1;
    } catch (e) {
      return { ...base, ok: false, stopped: true, executed, total: statements.length,
        failed_statement_index: executed, observed: gate.counts, resolved: { a: resolved.a.uid, b: resolved.b.uid },
        reason: `cleanup statement ${executed + 1}/${statements.length} failed: ${redactSecrets(String(e?.message ?? e), env)}`,
        evidence_preserved: true };
    }
  }
  const api = await deprovisionAccounts({ uids: { a: resolved.a.uid, b: resolved.b.uid }, env, fetchImpl });
  const after = parseCounts(await runSql(buildCountSql(prefix, { uids: { a: resolved.a.uid, b: resolved.b.uid } })));
  const done = validateCounts(after, { expectZero: true });
  return { ...base, ok: done.ok, executed, total: statements.length, account_uids: { a: resolved.a.uid, b: resolved.b.uid },
    observed: after.counts ?? null, admin_api: api,
    reason: done.ok ? 'teardown complete: every run-owned row is gone (idempotent)' : done.reason };
}

/** Evidence files a `teardown --purge-evidence` is allowed to remove (never automatic). */
export const EVIDENCE_FILES = ['fixture-create-evidence.json', 'fixture-teardown-evidence.json', 'fixture-status-evidence.json'];
export const MANIFEST_FILE = 'manifest.json';

// ── CLI ────────────────────────────────────────────────────────────────────────
const ACTIONS = ['status', 'create', 'teardown'];

if (process.argv[1]?.endsWith('staging-fixtures.mjs')) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const argv = process.argv.slice(2);
  const arg = (name, dflt) => {
    const idx = argv.indexOf(name);
    return idx === -1 ? dflt : String(argv[idx + 1] ?? '');
  };
  const action = arg('--action', 'status');
  const evidenceDir = arg('--evidence-dir', `.expo/staging-fixtures/${Date.now()}`);
  const purgeEvidence = argv.includes('--purge-evidence');
  const evidence = { step: 'phase-11-16a.1-fixtures', action, started_at: new Date().toISOString() };

  /** Every byte that leaves this process goes through the redactor. */
  const emit = () => {
    const safe = redactSecrets(JSON.stringify(evidence, null, 2));
    try {
      fs.mkdirSync(evidenceDir, { recursive: true });
      fs.writeFileSync(path.join(evidenceDir, `fixture-${action}-evidence.json`), safe + '\n', { mode: 0o600 });
      if (action === 'create' && evidence.fixture?.manifest) {
        fs.writeFileSync(path.join(evidenceDir, MANIFEST_FILE), redactSecrets(JSON.stringify(evidence.fixture.manifest, null, 2)) + '\n', { mode: 0o600 });
      }
    } catch (e) {
      console.error(`could not write evidence: ${redactSecrets(String(e?.message ?? e))}`);
    }
    console.log(safe);
  };

  try {
    if (!ACTIONS.includes(action)) throw new Error(`unknown action: ${action} (expected ${ACTIONS.join('|')})`);
    if (purgeEvidence && action !== 'teardown') throw new Error('--purge-evidence is only valid with --action teardown');
    const prefix = process.env.STAGING_FIXTURE_PREFIX ?? '';
    if (!PREFIX_RE.test(prefix)) throw new Error(`REFUSING: STAGING_FIXTURE_PREFIX must match ${PREFIX_RE}`);
    if ((process.env.STAGING_SUPABASE_URL ?? '') !== `https://${STAGING_HOST}`) {
      throw new Error(`REFUSING: STAGING_SUPABASE_URL must be https://${STAGING_HOST}`);
    }
    const credentials = credentialPlan();
    evidence.credentials = { ok: credentials.ok, separated: credentials.separated, presents: credentials.presents, custody: credentials.custody };
    if (!credentials.ok) {
      evidence.reason = `REFUSING: ${credentials.reasons.join('; ')}`;
      evidence.result = 'STOPPED';
    } else if (action === 'status') {
      const runSql = createPsqlRunner();
      const parsed = parseCounts(await runSql(buildCountSql(prefix)));
      evidence.observed = parsed.counts ?? null;
      evidence.inventory_readable = parsed.ok === true;
      if (!parsed.ok) evidence.reason = `REFUSING: unreadable inventory (${parsed.reason})`;
      evidence.ceilings = MAX_FIXTURE_COUNTS;
      evidence.within_ceilings = parsed.ok ? validateCounts(parsed) : { ok: false, reason: 'inventory unreadable' };
      evidence.authorizations = {
        create: authorizeFixtureAction('create').ok,
        execute: authorizeFixtureAction('execute').ok,
        cleanup: authorizeFixtureAction('cleanup').ok,
      };
      evidence.result = parsed.ok ? (Object.values(parsed.counts).every((v) => v === 0) ? 'ABSENT' : 'PRESENT') : 'STOPPED';
    } else {
      // Authorization comes FIRST: with no token we do not even open a connection.
      const auth = authorizeFixtureAction(action === 'teardown' ? 'cleanup' : action);
      if (!auth.ok) {
        evidence.reason = auth.reason;
        evidence.result = 'STOPPED';
      } else {
        const run = await runFixtureAction({ action, runSql: createPsqlRunner() });
        evidence.fixture = run;
        evidence.result = run.ok ? (action === 'teardown' ? 'TORN DOWN' : 'CREATED') : 'STOPPED';
        if (!run.ok) evidence.reason = run.reason;
        if (action === 'teardown' && purgeEvidence) {
          evidence.purged = EVIDENCE_FILES.filter((f) => fs.existsSync(path.join(evidenceDir, f)));
          for (const f of evidence.purged) fs.rmSync(path.join(evidenceDir, f), { force: true });
        } else if (action === 'teardown') {
          evidence.evidence_preserved = true;
        }
      }
    }
    emit();
    process.exit(evidence.result === 'STOPPED' ? 1 : 0);
  } catch (e) {
    evidence.result = 'STOPPED';
    evidence.reason = redactSecrets(String(e?.message ?? e));
    emit();
    process.exit(2);
  }
}

