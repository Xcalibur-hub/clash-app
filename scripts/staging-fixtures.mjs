/**
 * Staging fixture lifecycle (Phase 11 Step 16A) — deterministic, bounded, idempotent.
 *
 * NOTHING here runs against hosted staging until THREE separate authorizations are
 * present. No statement this module can emit is allowed to touch a row that does not
 * carry the run's own prefix, and `assertScoped` enforces that mechanically.
 *
 * Every id is derived from the prefix by `ids()`, so a teardown needs nothing but the
 * prefix — which is what makes cleanup possible after a partial setup failure.
 */
import { createHash } from 'node:crypto';
import { STAGING_HOST } from './staging-host.mjs';

const REF = STAGING_HOST.split('.')[0];
export const PROJECT_REF = REF;
/** Fixture ids are quoted into SQL, so the charset is deliberately tiny. */
export const PREFIX_RE = /^p11f_[a-z0-9]{8}$/;

/** Hard ceilings. Exceeding one of these aborts BEFORE any statement is sent. */
export const MAX_FIXTURE_COUNTS = {
  auth_users: 2,
  profiles: 2,
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

const hex = (s) => createHash('md5').update(s).digest('hex');
const asUuid = (s) => {
  const h = hex(s);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

/**
 * Every identifier the fixture set owns. `profileId` mirrors the database's own
 * derivation (`public.handle_new_user`: 'u_' || auth-uid without dashes), so the
 * fixture never inserts a profile row itself and never orphans one.
 */
export function ids(prefix) {
  if (!PREFIX_RE.test(prefix)) throw new Error(`refusing: prefix must match ${PREFIX_RE}`);
  const uid = (tag) => asUuid(`${prefix}:${tag}`);
  const profileId = (tag) => `u_${uid(tag).replace(/-/g, '')}`;
  return {
    prefix,
    accountA: { email: `${prefix}.a@fixture.invalid`, uid: uid('a'), profileId: profileId('a') },
    accountB: { email: `${prefix}.b@fixture.invalid`, uid: uid('b'), profileId: profileId('b') },
    vaultId: `${prefix}_vault`,
    dropId: `${prefix}_drop`,
    mediaId: `${prefix}_media`,
    /** Not a real object: fixtures never upload bytes (see the report, §3). */
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
 * The safety invariant, enforced on every statement the module emits and asserted by
 * the offline tests: no DELETE/UPDATE may exist that is not scoped to this run.
 *
 * "Scoped" means the statement carries the run's own prefix, or one of the identifiers
 * `ids(prefix)` derives from it (`md5(prefix:…)` — still unique to this run, still
 * unreachable from any other fixture set).
 */
export function assertScoped(statements, prefix, allowed) {
  const derived = allowed ?? Object.values(ids(prefix))
    .flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v)))
    .filter((v) => typeof v === 'string' && v !== prefix)
    .concat([ids(prefix).storagePath]);
  const ok = [prefix, ...derived];
  const scoped = [];
  for (const sql of statements) {
    // Unbounded first: a bare `delete from t` is the worst case and must say so.
    if (/delete\s+from\s+[a-z_.]+\s*;?$/i.test(sql.trim())) {
      throw new Error('refusing: unbounded DELETE (no WHERE clause)');
    }
    const touching = /\b(delete\s+from|update)\b/i.test(sql);
    if (touching && !ok.some((token) => sql.includes(token))) {
      throw new Error(`refusing: unscoped write without a run identifier: ${sql.slice(0, 80)}`);
    }
    scoped.push(sql);
  }
  return scoped;
}

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

/**
 * The exact set of hosted writes this step proposes — nothing more.
 * `:'fixture_password'` is a psql variable sourced from the environment at run time
 * (`\getenv`), so no credential ever appears in the SQL text or in an argument list.
 */
export function buildFixtureSql(prefix) {
  const i = ids(prefix);
  const setup = [
    // ── 1. Two accounts. `public.handle_new_user` creates each profile row with
    //       id = 'u_' || auth-uid, which is exactly what `ids()` predicts.
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
     select ${q(i.accountA.uid)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(i.accountA.email)}, crypt(:'fixture_password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
      where not exists (select 1 from auth.users u where u.id = ${q(i.accountA.uid)})`,
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
     select ${q(i.accountB.uid)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(i.accountB.email)}, crypt(:'fixture_password', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
      where not exists (select 1 from auth.users u where u.id = ${q(i.accountB.uid)})`,
    // ── 2. Ownership marker: makes every fixture row obvious in a manual review.
    `update public.profiles set handle = ${q(`${prefix}_a`)} where id = ${q(i.accountA.profileId)}`,
    `update public.profiles set handle = ${q(`${prefix}_b`)} where id = ${q(i.accountB.profileId)}`,
    // ── 3. Private media metadata. No bytes are uploaded: the signed-URL contract is
    //       proven by `createSignedUrl` succeeding, not by rendering the object.
    `insert into public.media_objects (id, owner_id, bucket, storage_path, media_kind, mime_type, size_bytes, status, visibility)
     values (${q(i.mediaId)}, ${q(i.accountA.profileId)}, 'private-media', ${q(i.storagePath)}, 'image', 'image/jpeg', 1024, 'ready', 'private')
     on conflict do nothing`,
    // ── 4. Vault + a subscriber-only Drop inside its 7-day window.
    `insert into public.creator_vaults (id, creator_id, title) values (${q(i.vaultId)}, ${q(i.accountA.profileId)}, 'Fixture Vault') on conflict do nothing`,
    `insert into public.vault_drops (id, vault_id, creator_id, caption, media_object_id, access_level, status, published_at, expires_at)
     values (${q(i.dropId)}, ${q(i.vaultId)}, ${q(i.accountA.profileId)}, 'fixture drop', ${q(i.mediaId)}, 'subscriber', 'published', now(), now() + interval '7 days')
     on conflict do nothing`,
    // ── 5. B's LAPSED entitlement: status stays 'active' (a real enum member) while the
    //       window has passed — an expiry modelled without inventing an enum value.
    //       `current_period_end > started_at` still holds, so the table CHECK passes.
    `insert into public.vault_subscriptions (id, subscriber_id, vault_id, status, started_at, current_period_end)
     values (${q(i.subscriptionId)}, ${q(i.accountB.profileId)}, ${q(i.vaultId)}, 'active', now() - interval '30 days', now() - interval '1 day')
     on conflict do nothing`,
    // ── 6. Course, an entitled lesson holding secret text, and a draft lesson.
    `insert into public.creator_courses (id, creator_id, title, access_type, status)
     values (${q(i.courseId)}, ${q(i.accountA.profileId)}, 'Fixture Course', 'subscriber', 'published') on conflict do nothing`,
    `insert into public.course_lessons (id, course_id, title, position, media_object_id, body_text, preview_allowed, access_type, status)
     values (${q(i.lessonEntitledId)}, ${q(i.courseId)}, 'Fixture Lesson', 1, ${q(i.mediaId)}, ${q(i.lessonSecret)}, false, 'subscriber', 'published') on conflict do nothing`,
    `insert into public.course_lessons (id, course_id, title, position, body_text, preview_allowed, access_type, status)
     values (${q(i.lessonDeniedId)}, ${q(i.courseId)}, 'Fixture Draft Lesson', 2, ${q(i.lessonSecret)}, false, 'subscriber', 'draft') on conflict do nothing`,
    // ── 7. Creator AI (enabled, FREE) plus the digital flags that make the function's own
    //       "not connected" branch reachable for VOICE while AVATAR stays disconnected.
    `insert into public.creator_ai_profiles (creator_id, enabled, display_name, access, avatar_provider, avatar_external_id, voice_enabled, avatar_enabled, likeness_consent_at)
     values (${q(i.accountA.profileId)}, true, 'Fixture AI', 'FREE', 'fixture-not-connected', ${q(`${prefix}_avatar`)}, true, false, now())
     on conflict (creator_id) do nothing`,
    `insert into public.creator_ai_conversations (id, creator_id, profile_id)
     values (${q(i.conversationId)}, ${q(i.accountA.profileId)}, ${q(i.accountB.profileId)}) on conflict do nothing`,
    `insert into public.creator_ai_messages (id, conversation_id, role, body)
     values (${q(i.messageId)}, ${q(i.conversationId)}, 'user', ${q(`${prefix}_seed_message`)}) on conflict do nothing`,
  ];

  // Children before parents, every statement addressed by an id derived from this run's
  // prefix. Re-running teardown is a no-op, and it is safe after a PARTIAL setup.
  const teardown = [
    `delete from public.creator_ai_messages where conversation_id = ${q(i.conversationId)}`,
    `delete from public.creator_ai_conversations where id = ${q(i.conversationId)}`,
    `delete from public.digital_creator_sessions where creator_id = ${q(i.accountA.profileId)}`,
    `delete from public.creator_ai_profiles where creator_id = ${q(i.accountA.profileId)}`,
    `delete from public.course_lessons where course_id = ${q(i.courseId)}`,
    `delete from public.creator_courses where id = ${q(i.courseId)}`,
    `delete from public.vault_subscriptions where id = ${q(i.subscriptionId)}`,
    `delete from public.vault_drops where id = ${q(i.dropId)}`,
    `delete from public.creator_vaults where id = ${q(i.vaultId)}`,
    `delete from public.media_objects where id = ${q(i.mediaId)}`,
    `delete from public.rate_limit_events where actor_id in (${q(i.accountA.profileId)}, ${q(i.accountB.profileId)})`,
    `delete from public.profiles where id in (${q(i.accountA.profileId)}, ${q(i.accountB.profileId)})`,
    `delete from auth.users where id in (${q(i.accountA.uid)}, ${q(i.accountB.uid)})`,
  ];
  return { ids: i, setup: assertScoped(setup, prefix), teardown: assertScoped(teardown, prefix) };
}

/** Counts what currently exists for this prefix — the expected-state pre-flight. */
export function buildCountSql(prefix) {
  const i = ids(prefix);
  const one = (table, col, val) => `(select count(*) from ${table} where ${col} = ${q(val)})`;
  return `select ${one('auth.users', 'id', i.accountA.uid)} + ${one('auth.users', 'id', i.accountB.uid)} as auth_users,
    ${one('public.profiles', 'id', i.accountA.profileId)} + ${one('public.profiles', 'id', i.accountB.profileId)} as profiles,
    ${one('public.creator_vaults', 'id', i.vaultId)} as creator_vaults,
    ${one('public.vault_drops', 'id', i.dropId)} as vault_drops,
    ${one('public.media_objects', 'id', i.mediaId)} as media_objects,
    ${one('public.vault_subscriptions', 'id', i.subscriptionId)} as vault_subscriptions,
    ${one('public.creator_courses', 'id', i.courseId)} as creator_courses,
    ${one('public.course_lessons', 'course_id', i.courseId)} as course_lessons,
    ${one('public.creator_ai_profiles', 'creator_id', i.accountA.profileId)} as creator_ai_profiles,
    ${one('public.creator_ai_conversations', 'id', i.conversationId)} as creator_ai_conversations,
    ${one('public.creator_ai_messages', 'conversation_id', i.conversationId)} as creator_ai_messages,
    ${one('public.digital_creator_sessions', 'creator_id', i.accountA.profileId)} as digital_creator_sessions`;
}

/** True when the observed counts exceed the ceilings — a fail-closed precondition. */
export function countsWithinCeilings(counts) {
  const over = Object.entries(MAX_FIXTURE_COUNTS)
    .filter(([k, max]) => Number(counts?.[k] ?? 0) > max)
    .map(([k, max]) => `${k}=${counts[k]} > ${max}`);
  return { ok: over.length === 0, over };
}

/**
 * Runs one fixture action. Everything is injected so the offline tests can execute the
 * whole state machine with a mocked SQL runner and observe every failure path.
 *
 * Fail-closed order: authorization → prefix → expected database state → statement-by-statement
 * execution. A failure NEVER triggers an automatic destructive cleanup, and never deletes
 * evidence: recovery is an explicit, separately authorized `teardown`.
 */
export async function runFixtureAction({ action, env = process.env, runSql, now = new Date() }) {
  const auth = authorizeFixtureAction(action === 'teardown' ? 'cleanup' : action, env);
  if (!auth.ok) return { ok: false, action, stopped: true, reason: auth.reason, executed: 0 };
  const prefix = env.STAGING_FIXTURE_PREFIX;
  const built = buildFixtureSql(prefix);
  const manifest = { step: 'phase-11-16a', prefix, project_ref: PROJECT_REF, created_at: now.toISOString(), ids: built.ids, action };

  let observed = null;
  if (action !== 'teardown') {
    observed = await runSql(buildCountSql(prefix));
    const within = countsWithinCeilings(observed);
    if (!within.ok) {
      return { ok: false, action, stopped: true, executed: 0, observed, manifest,
        reason: `REFUSING: unexpected database state (${within.over.join(', ')})` };
    }
  }

  const statements = action === 'teardown' ? built.teardown : built.setup;
  let executed = 0;
  for (const sql of statements) {
    try {
      await runSql(sql);
      executed += 1;
    } catch (e) {
      // Partial failure: report exactly where it stopped, keep the manifest and the
      // evidence, and leave cleanup to a separately authorized `teardown`.
      return { ok: false, action, stopped: true, executed, total: statements.length, observed, manifest,
        failed_statement_index: executed,
        reason: `statement ${executed + 1}/${statements.length} failed: ${String(e?.message ?? e).slice(0, 200)}`,
        cleanup_available: true, evidence_preserved: true };
    }
  }
  return { ok: true, action, executed, total: statements.length, observed, manifest,
    reason: action === 'teardown' ? 'teardown complete (idempotent; re-running is a no-op)' : 'fixtures present' };
}

/** Evidence files a `teardown --purge-evidence` is allowed to remove (never automatic). */
export const EVIDENCE_FILES = ['fixture-create-evidence.json', 'fixture-teardown-evidence.json', 'e2e-evidence.json'];

/**
 * Default SQL runner. Kept deliberately thin and STRICT: it refuses to start unless the
 * pinned CA and the connection target are the staging project, and it never takes the
 * password as an argument — psql reads it from the environment via `\getenv`, so the
 * credential never appears in argv or in the SQL text.
 */
export function createPsqlRunner(env = process.env) {
  return async function runSql(sql) {
    if ((env.STAGING_DB_TARGET ?? '') !== PROJECT_REF) {
      throw new Error(`refusing: STAGING_DB_TARGET must be ${PROJECT_REF}`);
    }
    if (!env.STAGING_DB_CA_PATH || !env.STAGING_FIXTURE_PASSWORD) {
      throw new Error('refusing: STAGING_DB_CA_PATH and STAGING_FIXTURE_PASSWORD are required');
    }
    const { spawnSync } = await import('node:child_process');
    const args = ['-h', `db.${STAGING_HOST}`, '-p', '5432', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-At'];
    const input = `\\getenv fixture_password STAGING_FIXTURE_PASSWORD\n${sql}`;
    const res = spawnSync('psql', args, {
      input, encoding: 'utf8', env: { ...env, PGSSLMODE: 'verify-full', PGSSLROOTCERT: env.STAGING_DB_CA_PATH },
    });
    if (res.error) throw new Error(`psql unavailable: ${res.error.message}`);
    if (res.status !== 0) throw new Error(`psql failed (${res.status}): ${String(res.stderr ?? '').slice(0, 200)}`);
    return parseCounts(res.stdout);
  };
}

/** Column order emitted by `buildCountSql` — the parser depends on this being identical. */
export const COUNT_COLUMNS = Object.keys(MAX_FIXTURE_COUNTS);

/** Parses the single `-At` counts row (values only, in `COUNT_COLUMNS` order). */
export function parseCounts(stdout) {
  const line = String(stdout ?? '').trim().split('\n').filter((l) => l.includes('|')).pop() ?? '';
  const values = line.split('|');
  if (values.length !== COUNT_COLUMNS.length) return {};
  return Object.fromEntries(COUNT_COLUMNS.map((k, idx) => [k, Number(values[idx] || 0)]));
}

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
  const evidence = { step: 'phase-11-16a-fixtures', action, started_at: new Date().toISOString() };

  try {
    if (!ACTIONS.includes(action)) throw new Error(`unknown action: ${action} (expected ${ACTIONS.join('|')})`);
    if (purgeEvidence && action !== 'teardown') throw new Error('--purge-evidence is only valid with --action teardown');
    const prefix = process.env.STAGING_FIXTURE_PREFIX ?? '';
    if (!PREFIX_RE.test(prefix)) throw new Error(`REFUSING: STAGING_FIXTURE_PREFIX must match ${PREFIX_RE}`);
    if ((process.env.STAGING_SUPABASE_URL ?? '') !== `https://${STAGING_HOST}`) {
      throw new Error(`REFUSING: STAGING_SUPABASE_URL must be https://${STAGING_HOST}`);
    }
    const runSql = createPsqlRunner();
    if (action === 'status') {
      const probe = await runSql(buildCountSql(prefix));
      evidence.observed = probe;
      evidence.ceilings = MAX_FIXTURE_COUNTS;
      evidence.within_ceilings = countsWithinCeilings(probe);
      evidence.authorizations = {
        create: authorizeFixtureAction('create').ok,
        execute: authorizeFixtureAction('execute').ok,
        cleanup: authorizeFixtureAction('cleanup').ok,
      };
      evidence.result = probe.auth_users === 0 ? 'ABSENT' : 'PRESENT';
    } else {
      // Authorization comes FIRST: with no token we do not even open a connection.
      const auth = authorizeFixtureAction(action === 'teardown' ? 'cleanup' : action);
      if (!auth.ok) {
        evidence.reason = auth.reason;
        evidence.result = 'STOPPED';
      } else {
        const run = await runFixtureAction({ action, runSql });
        evidence.fixture = run;
        evidence.result = run.ok ? (action === 'teardown' ? 'TORN DOWN' : 'CREATED') : 'STOPPED';
        if (action === 'teardown' && purgeEvidence) {
          // Only ever the listed evidence files, and only when explicitly asked for.
          evidence.purged = EVIDENCE_FILES.filter((f) => fs.existsSync(path.join(evidenceDir, f)));
          for (const f of evidence.purged) fs.rmSync(path.join(evidenceDir, f), { force: true });
        } else if (action === 'teardown') {
          evidence.evidence_preserved = true;
        }
      }
    }
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, `fixture-${action}-evidence.json`), JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(evidence.result === 'STOPPED' ? 1 : 0);
  } catch (e) {
    evidence.result = 'STOPPED';
    evidence.reason = String(e?.message ?? e);
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(2);
  }
}



