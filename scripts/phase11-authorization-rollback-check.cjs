/** One authorized Step 4C rollback-only validation. Never applies a migration ledger entry. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const scratch = path.join(root, '.expo', 'audit', 'step4c-rollback');
fs.mkdirSync(scratch, { recursive: true });
const migrationPath = 'supabase/migrations/20261011053717_critical_authorization_hardening.sql';
const suites = ['087_critical_authorization.sql', '002_clash_engine.sql',
  '008_clash_draw.sql', '039_vault_commerce.sql', '041_vault_communities.sql'];
const skipped = ['010_clash_scheduler.sql', '012_vault_access.sql', '075_maintenance_failure_recovery.sql'];
function run(command, args, input) {
  const result = spawnSync(command, args, { input, encoding: 'utf8', timeout: 180000,
    maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) {
    const error = new Error(`${command} failed (${result.status}): ${result.error?.message || result.stderr || result.stdout}`);
    error.stdout = result.stdout || '';
    throw error;
  }
  return result.stdout;
}
function sql(input) {
  return run('docker', ['exec', '-i', 'supabase_db_clash', 'psql', '-X', '-q', '-A', '-t',
    '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], input);
}
function readOnly(query) { return JSON.parse(sql(`BEGIN READ ONLY;\n${query}\nROLLBACK;`).trim()); }
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const git = args => run('git', ['-c', 'safe.directory=C:/p11auth', ...args]);
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '');

assert.equal(root.replaceAll('\\', '/').toLowerCase(), 'c:/p11auth');
assert.equal(git(['branch', '--show-current']).trim(), 'fix/phase-11-critical-authorization');
const migration = read(migrationPath);
assert.equal(migration.replaceAll('\r\n', '\n'),
  git(['show', `d2b9f39:${migrationPath}`]).replace(/^\uFEFF/, '').replaceAll('\r\n', '\n'),
  'Migration must match the reviewed implementation');
assert.equal(read('supabase/tests/087_critical_authorization.sql').replaceAll('\r\n', '\n'),
  git(['show', 'd2b9f39:supabase/tests/087_critical_authorization.sql']).replace(/^\uFEFF/, '').replaceAll('\r\n', '\n'));
const inspect = JSON.parse(run('docker', ['inspect', 'supabase_db_clash', '--format',
  '{{json .}}']));
assert.equal(inspect.Name, '/supabase_db_clash');
assert.match(inspect.Config.Image, /supabase\/postgres:/);
assert.equal(inspect.State.Running, true);
assert.ok(inspect.NetworkSettings.Ports['5432/tcp'].some(port => port.HostPort === '55322'));
// Never record container environment, which can contain secrets.
const target = { container: inspect.Name, image: inspect.Config.Image,
  host: 'localhost', port: 55322, database: 'postgres', transport: 'docker exec local Unix socket' };
console.log('Target:', JSON.stringify(target));
const tablesQuery = `select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname)
 order by n.nspname,c.relname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','auth','storage','supabase_migrations') and c.relkind in ('r','p');`;
const tables = readOnly(tablesQuery);
const rows = tables.map(t => {
  const name = `${quote(t.schema)}.${quote(t.table)}`;
  return `select ${literal(t.schema + '.' + t.table)} as name,count(*) as rows,
 md5(coalesce(string_agg(digest,',' order by digest),'')) as digest
 from (select md5(to_jsonb(r)::text) as digest from ${name} r) hashes`;
}).join('\nunion all\n');
const snapshotQuery = `select jsonb_build_object(
 'ledger',(select coalesce(jsonb_agg(jsonb_build_object('version',version,'rowHash',md5(to_jsonb(m)::text)) order by version),'[]'::jsonb) from supabase_migrations.schema_migrations m),
 'data',(select jsonb_agg(to_jsonb(d) order by name) from (${rows}) d),
 'relations',(select jsonb_agg(jsonb_build_object('oid',c.oid,'schema',n.nspname,'name',c.relname,
 'owner',c.relowner,'acl',c.relacl,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity) order by c.oid)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage','supabase_migrations')),
 'columns',(select jsonb_agg(jsonb_build_object('table',a.attrelid,'number',a.attnum,'name',a.attname,'acl',a.attacl,'type',a.atttypid)
 order by a.attrelid,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','auth','storage','supabase_migrations') and a.attnum>0 and not a.attisdropped),
 'functions',(select jsonb_agg(jsonb_build_object('oid',p.oid,'name',p.oid::regprocedure::text,'owner',p.proowner,'acl',p.proacl,
 'definer',p.prosecdef,'config',p.proconfig,'bodyHash',md5(p.prosrc)) order by p.oid)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth','storage','supabase_migrations')),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p
 where schemaname in ('public','auth','storage','supabase_migrations')),
 'roleMemberships',(select coalesce(jsonb_agg(to_jsonb(m) order by roleid,member),'[]'::jsonb) from pg_auth_members m),
 'effective',(select jsonb_agg(jsonb_build_object('role',role_name,
 'notify',has_function_privilege(role_name,'public.clash_notify(text,text,public.notification_kind,text)','EXECUTE'),
 'lessonTable',has_table_privilege(role_name,'public.course_lessons','SELECT'),
 'body',has_column_privilege(role_name,'public.course_lessons','body_text','SELECT'),
 'media',has_column_privilege(role_name,'public.course_lessons','media_object_id','SELECT')) order by role_name)
 from unnest(array['anon','authenticated','service_role']) role_name));`;
// Preflight is read-only: missing test infrastructure must not consume another
// owner-authorized validation transaction. Installing pgTAP needs fresh scope.
const tapAvailable = readOnly(`select jsonb_build_object('installed',exists(
 select 1 from pg_extension where extname='pgtap'),'noPlan',to_regprocedure('no_plan()') is not null);`);
assert.ok(tapAvailable.installed && tapAvailable.noPlan,
 'BLOCKED: pgTAP/no_plan is unavailable; no validation transaction started. Obtain fresh authorization for transactional test infrastructure.');
const baseline = readOnly(snapshotQuery);
fs.writeFileSync(path.join(scratch, 'baseline.json'), JSON.stringify(baseline, null, 2));
// Fail before the write-capable transaction if any committed fixture user already exists.
const fixtureUuids = [...new Set(suites.flatMap(file => [...read('supabase/tests/' + file)
  .matchAll(/'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/gi)].map(m => m[1])))];
const conflicts = readOnly(`select jsonb_build_object('users',count(*)) from auth.users where id in (${fixtureUuids.map(literal).join(',')});`);
assert.equal(conflicts.users, 0, 'Existing fixture UUID conflict; no write transaction authorized to overwrite it');
const policyBaseline = readOnly(`select coalesce(jsonb_agg(to_jsonb(p) order by policyname),'[]'::jsonb) from pg_policies p
 where schemaname='public' and tablename='notifications';`);
function stripBoundaries(text) {
  assert.equal((text.match(/^\s*begin;\s*$/gmi) || []).length, 1);
  assert.equal((text.match(/^\s*rollback;\s*$/gmi) || []).length, 1);
  text = text.replace(/^\s*begin;\s*$/gmi, '').replace(/^\s*rollback;\s*$/gmi, '');
  assert.ok(!/^\s*(?:begin|commit|rollback|end|savepoint|release|start\s+transaction|prepare\s+transaction)\s*[; ]/mi.test(text), 'Unexpected transaction command');
  assert.ok(!/^\s*\\/m.test(text), 'Unexpected psql command in suite');
  return text;
}
assert.ok(!/^\s*(?:commit|rollback|start\s+transaction|prepare\s+transaction)\b/mi.test(migration));
const sections = suites.map((file, i) => `\\echo SUITE_BEGIN ${file}
SAVEPOINT suite_${i};
${stripBoundaries(read('supabase/tests/' + file))}
RESET ROLE;
ROLLBACK TO SAVEPOINT suite_${i};
RELEASE SAVEPOINT suite_${i};
\\echo SUITE_END ${file}`);
sections.push(`\\echo SUITE_BEGIN effective_privileges
SAVEPOINT effective_privileges;
select no_plan();
select is((select count(*) from aclexplode((select proacl from pg_proc
 where oid='public.clash_notify(text,text,public.notification_kind,text)'::regprocedure))
 where grantee=0 and privilege_type='EXECUTE'),0::bigint,'PUBLIC helper execution removed');
select is((select coalesce(jsonb_agg(to_jsonb(p) order by policyname),'[]'::jsonb) from pg_policies p
 where schemaname='public' and tablename='notifications'),${literal(JSON.stringify(policyBaseline))}::jsonb,'notification RLS exactly unchanged');
select ok(not has_table_privilege('anon','public.course_lessons','SELECT'),'anon table-wide SELECT removed');
select ok(not has_table_privilege('authenticated','public.course_lessons','SELECT'),'authenticated table-wide SELECT removed');
select is((select count(*) from aclexplode((select relacl from pg_class where oid='public.course_lessons'::regclass))
 where grantee=0 and privilege_type='SELECT'),0::bigint,'PUBLIC lesson table SELECT absent');
select throws_ok('set local role service_role; select public.clash_notify(null,null,''clash_result'',''forged'')',
 '42501',null,'service role direct helper call denied');
RESET ROLE;
select is((select count(*) from pg_attribute a cross join lateral aclexplode(a.attacl) acl
 where a.attrelid='public.course_lessons'::regclass and acl.grantee=0 and acl.privilege_type='SELECT'),
 0::bigint,'PUBLIC column SELECT absent');
SET LOCAL ROLE authenticated;
select throws_ok('select * from public.course_lessons','42501',null,'authenticated wildcard read denied');
RESET ROLE;
select * from finish();
ROLLBACK TO SAVEPOINT effective_privileges;
RELEASE SAVEPOINT effective_privileges;
\\echo SUITE_END effective_privileges`);
const wrapper = `\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='5s';
select 'VALIDATION_TX_STARTED';
${migration}
${sections.join('\n')}
ROLLBACK;
select 'VALIDATION_ROLLED_BACK';
`;
fs.writeFileSync(path.join(scratch, 'validation.sql'), wrapper);
// Exclusive receipt prevents an accidental second authorized validation transaction.
fs.writeFileSync(path.join(scratch, 'attempt.json'), JSON.stringify({ target, migrationPath,
 migrationSha256: sha(migration), startedAt: new Date().toISOString() }), { flag: 'wx' });
let output = '', executionError = null, restoration = null;
try {
  // One non-interactive psql connection. ON_ERROR_STOP closes it on SQL errors,
  // causing PostgreSQL to abort its uncommitted transaction. No COMMIT exists.
  output = sql(wrapper);
} catch (error) { executionError = error.message; output = error.stdout || ''; }
finally {
  // Fresh read-only session independently confirms restoration even on runner failure.
  try {
    const after = readOnly(snapshotQuery);
    fs.writeFileSync(path.join(scratch, 'after.json'), JSON.stringify(after, null, 2));
    restoration = { equal: JSON.stringify(baseline) === JSON.stringify(after),
      comparedTables: tables.length, changedSections: Object.keys(baseline)
        .filter(key => JSON.stringify(baseline[key]) !== JSON.stringify(after[key])) };
  } catch (error) { restoration = { equal: false, verificationError: error.message }; }
}
fs.writeFileSync(path.join(scratch, 'tap.txt'), output || executionError || 'No SQL output');
const results = [];
for (const match of output.matchAll(/SUITE_BEGIN ([^\r\n]+)\r?\n([\s\S]*?)SUITE_END \1/g)) {
  const body = match[2], assertions = [...body.matchAll(/^(not ok|ok)\s+(\d+)\b.*$/gm)];
  const plan = [...body.matchAll(/^1\.\.(\d+)\s*$/gm)];
  results.push({ suite: match[1], assertions: assertions.length,
    failed: assertions.filter(a => a[1] === 'not ok').length,
    planValid: plan.length === 1 && Number(plan[0][1]) === assertions.length &&
      assertions.every((a, i) => Number(a[2]) === i + 1), bailout: /^Bail out!/mi.test(body) });
}
const summary = { status: executionError || !restoration.equal ? 'BLOCKED' :
  results.length !== sections.length || results.some(r => r.failed || !r.planValid || r.bailout) ? 'FAIL' : 'PASS',
 target, migrationPath, migrationSha256: sha(migration), oneValidationSession: true,
 explicitRollbackObserved: output.includes('VALIDATION_ROLLED_BACK'), results,
 total: results.reduce((n, r) => n + r.assertions, 0), failures: results.reduce((n, r) => n + r.failed, 0),
 restoration, skipped, executionError };
if (!summary.explicitRollbackObserved && summary.status === 'PASS') summary.status = 'BLOCKED';
fs.writeFileSync(path.join(scratch, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.status !== 'PASS') process.exitCode = 1;
