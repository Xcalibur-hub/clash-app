#!/usr/bin/env node
// ============================================================================
// CLASH cloud package builder — deterministic, offline, idempotent.
//
// Reads the 119 original migrations from supabase/migrations/ (READ ONLY) and
// emits every generated artefact of the cloud deployment package:
//
//   manifest.json                      per-migration identity + normalisation
//   generated/000_ledger_bootstrap.sql CLI-shaped migration ledger (create only)
//   generated/NNN_<version>.sql        one ATOMIC wrapper per migration:
//                                        begin; <normalised SQL>; <ledger insert>; commit;
//   generated/.gitattributes           pins LF so hashes survive checkout
//   preflight/00_preflight.sql         fail-closed gates (report + guard)
//   verify/90_verify.sql               fail-closed post-conditions incl. exact
//                                      per-migration identity and RPC signatures
//   verify/95_storage_config.sql       read-only Storage config verification
//   checksums.sha256                   originals + every generated file
//
// Design decisions that the Codex audit (F1-F8) forced:
//   F1  the ledger row is written INSIDE the same transaction as the migration,
//       so there is no window where the schema is applied but the ledger is not.
//   F2  migrations 110/119 carry their own begin;/commit;. Those two standalone
//       statements are stripped and recorded as a normalisation, so the wrapper
//       can own the transaction without nesting or early commit.
//   F3  file 13's wrapper executes the variant and records the VARIANT as the
//       executed identity (name + sha256 + source path), never the original.
//   F4  no Storage writes are generated at all. Migration 4 already creates the
//       buckets and policies when the Storage tables exist (which is always the
//       case on hosted). 95_storage_config.sql only verifies.
//   F6  every gate fails closed: a missing/mismatched identity is an error.
//   R2  every entry carries wrapperSha256, the digest of the exact wrapper file,
//       so the runner can compare bytes-on-disk with bytes-as-reviewed before
//       execution instead of hashing into an unused variable.
//
// Nothing here connects to a database. No migration is executed.
// ============================================================================

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Round 6: URL.pathname is not a filesystem path. On Windows it is
// '/C:/Users/.../' with percent-encoded spaces, and every path built from it is
// wrong ('C:\\C:\\Users\\...'), so the builder could not even read the
// migrations it is supposed to package. fileURLToPath() is the only conversion.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'); // repo root
const MIG = join(ROOT, 'supabase/migrations');
const CLOUD = join(ROOT, 'supabase/cloud');
const GEN = join(CLOUD, 'generated');

const PROJECT_REF = 'kgaqejgubjemdecifzew';
const SOURCE_COMMIT = '2b898748a48e317ac5737da62c7a964f50aca2a8';
const DIVERGED_VERSION = '20260927030000';
const DIVERGED_NAME = 'clash_scheduler__cloud_nocron';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const lf = (s) => s.replace(/\r\n/g, '\n');

/** Strip standalone BEGIN;/COMMIT; lines (F2) and report whether we did. */
function normalise(sql) {
  const lines = lf(sql).split('\n');
  const kept = [];
  let stripped = 0;
  for (const line of lines) {
    if (/^\s*(begin|commit)\s*;\s*$/i.test(line)) { stripped++; continue; }
    kept.push(line);
  }
  const text = kept.join('\n');
  return { text, stripped, kind: stripped > 0 ? 'strip-begin-commit' : 'none' };
}

/** Balanced-paren scan: return the argument list of `function public.<name>(`. */
function functionArgs(src, name) {
  const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`, 'gi');
  let out = null;
  let m;
  while ((m = re.exec(src)) !== null) {
    let i = re.lastIndex, depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
      i++;
    }
    out = src.slice(re.lastIndex, i - 1);
  }
  return out; // last definition wins (later migrations redefine)
}

/** "p_room_id text, p_x integer default 3" -> "text, integer" */
function typeList(argBlock) {
  if (argBlock === null) return null;
  const args = [];
  let depth = 0, cur = '';
  for (const ch of argBlock) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { args.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) args.push(cur);

  return args.map((raw) => {
    let a = raw.trim();
    a = a.replace(/\s+default\s+[\s\S]*$/i, '');          // drop defaults
    a = a.split(/\s+/).slice(1).join(' ');                 // drop the arg name
    return a.trim();
  }).filter(Boolean).join(', ');
}

const RPC_TARGETS = [
  'create_arena_daily_topic', 'join_arena_topic', 'post_arena_room_message',
  'list_arena_official_page', 'watch_arena_room', 'settle_arena_room',
  'run_maintenance', 'my_profile_id', 'owns_profile',
];

// ---------------------------------------------------------------- build ----
const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
if (files.length !== 119) {
  console.error(`REFUSING: expected 119 migrations, found ${files.length}`);
  process.exit(1);
}

const snapshot = JSON.parse(readFileSync(join(CLOUD, 'source-snapshot.json'), 'utf8'));
if (snapshot.total !== 119 || snapshot.entries.length !== 119 ||
    snapshot.entries.some((e, i) => e.file !== 'supabase/migrations/' + files[i] ||
      createHash('sha256').update(readFileSync(join(ROOT, e.file))).digest('hex') !== e.sha256)) {
  throw new Error('REFUSING: frozen migration snapshot mismatch');
}
const allSource = files.map((f) => readFileSync(join(MIG, f), 'utf8')).join('\n');
const rpc = {};
for (const name of RPC_TARGETS) {
  const args = typeList(functionArgs(allSource, name));
  if (args === null) { console.error(`REFUSING: RPC ${name} not found in migrations`); process.exit(1); }
  rpc[name] = args;
}

const entries = files.map((file, i) => {
  const version = file.slice(0, 14);
  const originalText = readFileSync(join(MIG, file), 'utf8');
  const originalSha = sha256(lf(originalText));

  const diverged = version === DIVERGED_VERSION;
  const sourcePath = diverged
    ? 'supabase/cloud/migrations/20260927030000_clash_scheduler__cloud_nocron.sql'
    : `supabase/migrations/${file}`;
  const executedText = diverged ? readFileSync(join(ROOT, sourcePath), 'utf8') : originalText;
  const executedSha = sha256(lf(executedText));

  const norm = normalise(executedText);
  if (norm.text.includes('$clash_')) {
    console.error(`REFUSING: ${sourcePath} contains the dollar-quote tag`);
    process.exit(1);
  }

  return {
    index: i + 1,
    version,
    name: file.slice(15).replace(/\.sql$/, ''),
    file: `supabase/migrations/${file}`,
    sha256: originalSha,
    bytes: Buffer.byteLength(lf(originalText), 'utf8'),
    rawBytes: Buffer.byteLength(originalText, 'utf8'),
    mode: diverged ? 'diverged' : 'direct',
    ledgerName: diverged ? DIVERGED_NAME : file.slice(15).replace(/\.sql$/, ''),
    sqlPath: sourcePath,
    executedSha256: executedSha,
    normalisation: norm.kind,
    normalizedSha256: sha256(norm.text),
    statementsStored: true,
    wrapperPath: `${String(i + 1).padStart(3, '0')}_${version}.sql`,
    wrapperSha256: null,   // filled in below, once the wrapper text exists
  };
}).map((e) => ({ ...e, _text: normalise(readFileSync(join(ROOT, e.sqlPath), 'utf8')).text }));

// ------------------------------------------------------------- generated ---
// Never delete an existing output tree. Stale or unexpected wrapper names refuse regeneration.
const expectedGenerated = new Set(['.gitattributes', '000_ledger_bootstrap.sql', ...entries.map(e => e.wrapperPath)]);
if (existsSync(GEN) && readdirSync(GEN).some(name => !expectedGenerated.has(name))) {
  throw new Error('REFUSING: unexpected generated output; preserve and review it');
}
mkdirSync(GEN, { recursive: true });
mkdirSync(join(CLOUD, 'preflight'), { recursive: true });
mkdirSync(join(CLOUD, 'verify'), { recursive: true });

writeFileSync(join(GEN, '.gitattributes'),
  '# Generated wrappers must stay byte-identical so ledger sha256 checks hold.\n*.sql -text\n');

writeFileSync(join(GEN, '000_ledger_bootstrap.sql'), `-- CLASH cloud — step 0: CLI-shaped migration ledger.
-- Safe to re-run: creates only. If the Supabase CLI already made this table,
-- every statement here is a no-op. Column set is a superset of the columns the
-- CLI has used across versions (version/statements/name/created_by/idempotency_key);
-- extra nullable columns are ignored by older CLIs.
create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version         text not null primary key,
  statements      text[],
  name            text,
  created_by      text,
  idempotency_key text
);

alter table supabase_migrations.schema_migrations
  add column if not exists statements text[],
  add column if not exists name text,
  add column if not exists created_by text,
  add column if not exists idempotency_key text;

-- Round 8: exclusive-writer claim. One row, one key. deploy.ps1 inserts its run
-- id here before the first migration; a second runner started at the same time
-- collides on the primary key and stops instead of executing anything. The row
-- is released only after postflight passes, so a crashed run leaves a claim that
-- blocks the next run until a human inspects it (ROLLBACK.md T1).
create table if not exists supabase_migrations.clash_deploy_claim (
  claim_key   text not null primary key,
  run_id      text not null,
  started_utc timestamptz not null
);
`);

for (const e of entries) {
  const tag = `$clash_${e.version}$`;
  const label = String(e.index).padStart(3, '0');
  const wrapper = `-- ============================================================================
-- CLASH cloud wrapper — step ${e.index} of 119
-- version           : ${e.version}
-- ledger name       : ${e.ledgerName}
-- mode              : ${e.mode}${e.mode === 'diverged' ? '  (see DIVERGENCES.md D-1)' : ''}
-- executed source   : ${e.sqlPath}
-- executed sha256   : ${e.executedSha256}
-- normalisation     : ${e.normalisation}
-- normalized sha256 : ${e.normalizedSha256}
--
-- ATOMICITY: the migration SQL and its ledger row are committed together.
-- A server-side error before COMMIT aborts the transaction, so neither the
-- schema change nor its ledger row survives. A connection lost around COMMIT
-- can leave the outcome unknown, which is why the runner classifies it from
-- the ledger instead of claiming a rollback.
--
-- CONCURRENCY (Round 8): the ledger insert has NO conflict clause. If a row for
-- this version already exists, the insert raises unique_violation, the whole
-- transaction aborts and no statement of the migration survives. An
-- 'on conflict do nothing' would have skipped the row while re-executing the
-- migration body - the one case the read-back could not detect.
-- ============================================================================
begin;

${e._text}
${e._text.endsWith('\n') ? '' : '\n'}
insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values (
  '${e.version}',
  '${e.ledgerName}',
  array['sha256:${e.normalizedSha256}'],
  'clash-cloud-wrapper-v1'
);

commit;
`;
  writeFileSync(join(GEN, `${label}_${e.version}.sql`), wrapper);
  // the digest deploy.ps1 compares against the bytes on disk immediately before
  // executing this wrapper (audit F5: an unused hash is not enforcement)
  e.wrapperSha256 = sha256(lf(wrapper));
}

const missingWrapperDigest = entries.filter((e) => !e.wrapperSha256);
if (missingWrapperDigest.length) {
  console.error(`REFUSING: ${missingWrapperDigest.length} entries without a wrapper digest`);
  process.exit(1);
}

// --------------------------------------------------------------- SQL gates --
function buildGate({ title, header, checks, guardLabel }) {
  const raw = (c) => `  select ${c.ord} as ord, ${lit(c.name)}::text as check_name, ${lit(c.expected)}::text as expected, ${c.actual}::text as actual`;
  const body = checks.map(raw).join('\n  union all\n');
  const statusCase = `case
         when r.check_name like 'INFO%' then 'INFO'
         when r.expected like '>=%' then case when r.actual::int >= substring(r.expected from 3)::int then 'PASS' else 'FAIL' end
         else case when r.actual = r.expected then 'PASS' else 'FAIL' end
       end`;
  return `-- ${title}
-- ============================================================================
${header}
-- FAIL-CLOSED: this file ends with a guard that RAISEs when any gating check
-- fails, so psql -v ON_ERROR_STOP=1 exits non-zero. An empty result set or an
-- ignored report can never be mistaken for success.
-- ============================================================================

select ord, check_name, expected, actual,
       ${statusCase.replace(/\nr\./g, '\n         r.')} as status
  from (
${body}
  ) r
 order by ord;

do $${guardLabel}$
declare
  v_fail text;
begin
  select string_agg(c.ord::text || '. ' || c.check_name || '  expected=' || c.expected || '  actual=' || c.actual, E'\\n')
    into v_fail
    from (
      select r.ord, r.check_name, r.expected, r.actual,
             ${statusCase} as status
        from (
${body}
        ) r
     ) c
   where c.status = 'FAIL';

  if v_fail is not null then
    raise exception E'${guardLabel} FAILED:\\n%', v_fail;
  end if;

  raise notice '${guardLabel} OK: every gating check passed';
end
$${guardLabel}$;
`;
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

const now = Date.parse(snapshot.preparedAtUtc); // Actual time the source snapshot was sealed.
const total = entries.length;

const preflightChecks = [
  { ord: 1, name: 'postgres major version 17', expected: '17', actual: "split_part(current_setting('server_version'), '.', 1)" },
  { ord: 2, name: 'wal_level', expected: 'logical', actual: "current_setting('wal_level')" },
  { ord: 3, name: 'replication slots', expected: '0', actual: '(select count(*)::text from pg_replication_slots)' },
  { ord: 4, name: 'baseline public relations', expected: '0', actual: "(select count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S','f'))" },
  { ord: 5, name: 'baseline public functions', expected: '0', actual: "(select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')" },
  { ord: 6, name: 'baseline auth.users rows', expected: '0', actual: '(select count(*)::text from auth.users)' },
  { ord: 7, name: 'baseline storage.buckets rows', expected: '0', actual: '(select count(*)::text from storage.buckets)' },
  { ord: 8, name: 'postgis installed in extensions', expected: 'postgis|extensions', actual: "coalesce((select e.extname||'|'||n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='postgis'),'ABSENT')" },
  { ord: 9, name: 'pgcrypto schema', expected: 'extensions', actual: "coalesce((select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'),'ABSENT')" },
  { ord: 10, name: 'pg_cron extension absent', expected: 'ABSENT', actual: "coalesce((select extversion from pg_extension where extname='pg_cron'),'ABSENT')" },
  { ord: 11, name: 'cron.schedule() absent', expected: 'ABSENT', actual: "coalesce(to_regprocedure('cron.schedule(text,text,text)')::text,'ABSENT')" },
  { ord: 12, name: 'schema cron absent', expected: 'ABSENT', actual: "coalesce((select nspname from pg_namespace where nspname='cron'),'ABSENT')" },
  { ord: 13, name: 'publication supabase_realtime owner', expected: 'postgres', actual: "coalesce((select r.rolname from pg_publication p join pg_roles r on r.oid=p.pubowner where p.pubname='supabase_realtime'),'ABSENT')" },
  { ord: 14, name: 'publication supabase_realtime tables', expected: '0', actual: "(select count(*)::text from pg_publication_tables where pubname='supabase_realtime')" },
  { ord: 15, name: 'realtime.messages RLS', expected: 'true', actual: "coalesce((select relrowsecurity::text from pg_class where oid=to_regclass('realtime.messages')),'ABSENT')" },
  { ord: 16, name: 'API roles present', expected: '4', actual: "(select count(*)::text from pg_roles where rolname in ('anon','authenticated','service_role','authenticator'))" },
  { ord: 17, name: 'storage.objects.owner type', expected: 'uuid', actual: "coalesce((select data_type from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner'),'ABSENT')" },
  { ord: 18, name: 'supautils delegates storage.objects policy DDL', expected: 'delegated', actual: "case when (select setting from pg_settings where name='supautils.policy_grants') like '%storage.objects%' then 'delegated' else 'MISSING' end" },
  { ord: 19, name: 'supautils delegates realtime.messages policy DDL', expected: 'delegated', actual: "case when (select setting from pg_settings where name='supautils.policy_grants') like '%realtime.messages%' then 'delegated' else 'MISSING' end" },
  { ord: 20, name: 'INFO supautils privileged_extensions has pg_cron', expected: 'INFO', actual: "case when (select setting from pg_settings where name='supautils.privileged_extensions') like '%pg_cron%' then 'INFO present - file 13 variant mandatory' else 'INFO absent' end" },
  { ord: 21, name: 'INFO expected step count', expected: 'INFO', actual: `'INFO ${total} wrappers'` },
];

writeFileSync(join(CLOUD, 'preflight/00_preflight.sql'), buildGate({
  title: 'CLASH CLOUD — 00_preflight.sql (generated; do not edit)',
  header: `-- Project: ${PROJECT_REF}   Source: ${SOURCE_COMMIT}
-- Run BEFORE deployment. READ-ONLY: issues SELECTs only.`,
  checks: preflightChecks,
  guardLabel: 'preflight',
}));

const hashValues = entries
  .map((e) => `    (${lit(e.version)}, ${lit(e.normalizedSha256)}, ${lit(e.ledgerName)})`)
  .join(',\n');

const verifyChecks = [
  { ord: 1, name: 'ledger rows', expected: String(total), actual: '(select count(*)::text from supabase_migrations.schema_migrations)' },
  { ord: 2, name: 'ledger versions match manifest exactly', expected: String(total), actual: `(select count(*)::text from supabase_migrations.schema_migrations m join (values\n${hashValues}\n  ) as e(version, sha, name) on e.version = m.version)` },
  { ord: 3, name: 'ledger has no extra versions', expected: '0', actual: `(select count(*)::text from supabase_migrations.schema_migrations m where not exists (select 1 from (values\n${hashValues}\n  ) as e(version, sha, name) where e.version = m.version))` },
  { ord: 4, name: 'every ledger row stores a sha256', expected: '0', actual: "(select count(*)::text from supabase_migrations.schema_migrations where statements is null or array_length(statements,1) is null or statements[1] not like 'sha256:%')" },
  { ord: 5, name: 'executed-text sha256 matches manifest for all', expected: '0', actual: `(select count(*)::text from supabase_migrations.schema_migrations m join (values\n${hashValues}\n  ) as e(version, sha, name) on e.version = m.version where m.statements[1] is distinct from 'sha256:' || e.sha)` },
  { ord: 6, name: 'file 13 recorded as the cloud variant', expected: DIVERGED_NAME, actual: `coalesce((select name from supabase_migrations.schema_migrations where version='${DIVERGED_VERSION}'),'ABSENT')` },
  { ord: 7, name: 'core tables present', expected: '8', actual: "(select count(*)::text from (values ('profiles'),('arena_rooms'),('arena_room_messages'),('arena_daily_topics'),('media_objects'),('rate_limit_events'),('arena_room_results'),('arena_room_participants')) as t(tbl) where to_regclass('public.'||t.tbl) is not null)" },
  { ord: 8, name: 'RPC signatures exact', expected: '0', actual: `(select count(*)::text from (values\n${Object.entries(rpc).map(([fn, args]) => `    (${lit(fn)}, ${lit(args)})`).join(',\n')}\n  ) as e(fn, args) where to_regprocedure('public.'||e.fn||'('||e.args||')') is null)` },
  { ord: 9, name: 'publication contains arena_room_messages', expected: 'true', actual: "(select (count(*)>0)::text from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='arena_room_messages')" },
  { ord: 10, name: 'realtime.messages policies count', expected: '>=5', actual: "(select count(*)::text from pg_policy where polrelid=to_regclass('realtime.messages'))" },
  { ord: 11, name: 'run_maintenance not executable by anon', expected: 'false', actual: "has_function_privilege('anon','public.run_maintenance(integer)','EXECUTE')::text" },
  { ord: 12, name: 'run_maintenance not executable by authenticated', expected: 'false', actual: "has_function_privilege('authenticated','public.run_maintenance(integer)','EXECUTE')::text" },
  { ord: 13, name: 'run_maintenance executable by service_role', expected: 'true', actual: "has_function_privilege('service_role','public.run_maintenance(integer)','EXECUTE')::text" },
  { ord: 14, name: 'TRIPWIRE pg_cron absent', expected: 'ABSENT', actual: "coalesce((select extversion from pg_extension where extname='pg_cron'),'ABSENT')" },
  { ord: 15, name: 'TRIPWIRE cron.schedule absent', expected: 'ABSENT', actual: "coalesce(to_regprocedure('cron.schedule(text,text,text)')::text,'ABSENT')" },
  { ord: 16, name: 'TRIPWIRE schema cron absent', expected: 'ABSENT', actual: "coalesce((select nspname from pg_namespace where nspname='cron'),'ABSENT')" },
  { ord: 17, name: 'TRIPWIRE no cron job rows', expected: 'ABSENT', actual: "case when to_regclass('cron.job') is null then 'ABSENT' else coalesce((xpath('/row/j/text()', query_to_xml('select string_agg(jobname,' || quote_literal('|') || ') as j from cron.job', false, true, '')))[1]::text,'ABSENT') end" },
  { ord: 18, name: 'realtime.messages RLS still enabled', expected: 'true', actual: "coalesce((select relrowsecurity::text from pg_class where oid=to_regclass('realtime.messages')),'ABSENT')" },
  { ord: 19, name: 'wal_level unchanged', expected: 'logical', actual: "current_setting('wal_level')" },
  {"ord":20,"name":"public tables without RLS","expected":"0","actual":"(select count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity)"},
  {"ord":21,"name":"beta guard prerequisites present","expected":"0","actual":"(select count(*)::text from (values ('public.guard_beta_take_identity()'),('public.assert_release_admission(text)'),('public.guard_beta_membership_admission()'),('public.guard_beta_storage_upload()')) e(signature) where to_regprocedure(e.signature) is null)"},
  {"ord":22,"name":"Meet admission closed","expected":"false","actual":"public.meet_new_admission_allowed()::text"},
  {"ord":23,"name":"beta take identity trigger enabled","expected":"1","actual":"(select count(*)::text from pg_trigger where tgrelid='public.takes'::regclass and tgname='beta_take_identity' and tgenabled<>'D' and tgfoid='public.guard_beta_take_identity()'::regprocedure)"},
  {"ord":24,"name":"beta participant write fences enabled","expected":"6","actual":"(select count(*)::text from pg_trigger where tgname='beta_membership_admission' and tgenabled<>'D' and tgfoid='public.guard_beta_membership_admission()'::regprocedure and tgrelid in ('public.arena_crew_memberships'::regclass,'public.arena_crew_follows'::regclass,'public.vault_community_memberships'::regclass,'public.explore_challenge_participants'::regclass,'public.explore_treasure_progress'::regclass,'public.arena_room_participants'::regclass))"},
  {"ord":25,"name":"Storage upload admission trigger enabled","expected":"1","actual":"(select count(*)::text from pg_trigger where tgrelid='storage.objects'::regclass and tgname='beta_storage_upload_admission' and tgenabled<>'D' and tgfoid='public.guard_beta_storage_upload()'::regprocedure)"},
  {"ord":26,"name":"legacy start_clash API execute grants","expected":"0","actual":"(select count(*)::text from (values ('anon'),('authenticated'),('service_role')) r(role) where has_function_privilege(r.role,'public.start_clash(text,text,public.clash_mode)','EXECUTE'))"},
  {"ord":27,"name":"creator continuation approval API table grants","expected":"0","actual":"(select count(*)::text from (values ('anon'),('authenticated'),('service_role')) r(role) where has_table_privilege(r.role,'public.creator_live_continuation_approvals','SELECT,INSERT,UPDATE,DELETE'))"},
  {"ord":28,"name":"obsolete Storage admission policies","expected":"0","actual":"(select count(*)::text from pg_policy where polrelid='storage.objects'::regclass and polname in ('media upload into own namespace','own media objects are updatable'))"},
];

writeFileSync(join(CLOUD, 'verify/90_verify.sql'), buildGate({
  title: 'CLASH CLOUD — 90_verify.sql (generated; do not edit)',
  header: `-- Project: ${PROJECT_REF}
-- Run AFTER all 119 wrappers. READ-ONLY.
-- Checks 1-8 are identity checks: the ledger must contain exactly these 119
-- versions, each storing the sha256 of the text that actually executed.`,
  checks: verifyChecks,
  guardLabel: 'postflight',
}));

const storageChecks = [
  { ord: 1, name: 'bucket count for media', expected: '2', actual: "(select count(*)::text from storage.buckets where id in ('public-media','private-media'))" },
  { ord: 2, name: 'public-media is public', expected: 'true', actual: "coalesce((select public::text from storage.buckets where id='public-media'),'ABSENT')" },
  { ord: 3, name: 'private-media is private', expected: 'false', actual: "coalesce((select public::text from storage.buckets where id='private-media'),'ABSENT')" },
  { ord: 4, name: 'file_size_limit', expected: '104857600', actual: "coalesce((select file_size_limit::text from storage.buckets where id='public-media'),'ABSENT')" },
  { ord: 5, name: 'mime allowlist length', expected: '8', actual: "coalesce((select array_length(allowed_mime_types,1)::text from storage.buckets where id='public-media'),'ABSENT')" },
  { ord: 6, name: 'storage.objects policies', expected: '4', actual: "(select count(*)::text from pg_policy where polrelid=to_regclass('storage.objects') and polname in ('media objects are publicly readable','own media objects are readable','admitted media upload only','own media objects are deletable'))" },
  { ord: 7, name: 'INFO created by migration 4, not by this package', expected: 'INFO', actual: "'INFO migration 20260926150000 owns bucket+policy creation'" },
];

writeFileSync(join(CLOUD, 'verify/95_storage_config.sql'), buildGate({
  title: 'CLASH CLOUD — 95_storage_config.sql (generated; do not edit)',
  header: `-- Project: ${PROJECT_REF}
-- READ-ONLY. Migration 4 (20260926150000_media_storage.sql) creates the buckets
-- and original storage policies; migration 119 replaces upload admission and removes UPDATE.
-- which is always true on hosted Supabase. This file therefore VERIFIES the
-- exact configuration and writes nothing (audit finding F4).`,
  checks: storageChecks,
  guardLabel: 'storage_verify',
}));

// -------------------------------------------------------------- manifest ----
const manifest = {
  project_ref: PROJECT_REF,
  source_commit: SOURCE_COMMIT,
  source_state: 'uncommitted-current-source-overlay',
  source_snapshot: 'supabase/cloud/source-snapshot.json',
  source_snapshot_sha256: sha256(lf(readFileSync(join(CLOUD, 'source-snapshot.json'), 'utf8'))),
  builder: 'tools/build-package.mjs',
  built_at_utc: new Date(now).toISOString(),
  total,
  ledger_column_shape: ['version', 'statements', 'name', 'created_by', 'idempotency_key'],
  identity_convention: 'statements[1] = "sha256:<normalizedSha256 of the exact text executed>"',
  divergence: 'DIVERGENCES.md D-1 (executed identity of file 13)',
  normalisation_policy: 'standalone BEGIN;/COMMIT; lines stripped (D-2)',
  rpc_signatures: rpc,
  entries: entries.map(({ _text, ...e }) => e),
};
writeFileSync(join(CLOUD, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// -------------------------------------------------------------- checksums ---
const { execFileSync } = await import('node:child_process');
const list = [
  ...files.map((f) => `supabase/migrations/${f}`),
  'supabase/cloud/manifest.json',
  'supabase/cloud/source-snapshot.json',
  'supabase/cloud/README.md',
  'supabase/cloud/DIVERGENCES.md',
  'supabase/cloud/ROLLBACK.md',
  'supabase/cloud/migrations/20260927030000_clash_scheduler__cloud_nocron.sql',
  'supabase/cloud/preflight/00_preflight.sql',
  'supabase/cloud/verify/90_verify.sql',
  'supabase/cloud/verify/95_storage_config.sql',
  ...readdirSync(GEN).filter((f) => f.endsWith('.sql')).sort().map((f) => `supabase/cloud/generated/${f}`),
  ...readdirSync(join(CLOUD, 'tools')).filter((f) => /\.(ps1|mjs)$/.test(f)).sort().map((f) => `supabase/cloud/tools/${f}`),
  ...readdirSync(join(CLOUD, 'tools/lib')).filter((f) => f.endsWith('.ps1')).sort().map((f) => `supabase/cloud/tools/lib/${f}`),
  ...readdirSync(join(CLOUD, 'tests')).filter((f) => /\.(mjs|ps1)$/.test(f)).sort().map((f) => `supabase/cloud/tests/${f}`),
  'supabase/cloud/tests/assertion-inventory.txt',
].filter((p) => existsSync(join(ROOT, p)));

writeFileSync(join(CLOUD, 'checksums.sha256'),
  list.map((p) => `${sha256(lf(readFileSync(join(ROOT, p), 'utf8')))}  ${p}`).join('\n') + '\n');

console.log(`built ${total} wrappers, ${list.length} checksummed files`);
console.log('rpc signatures derived:');
for (const [k, v] of Object.entries(rpc)) console.log(`  ${k}(${v})`);
