// Compare installed Crowd objects before repairing its local migration ledger.
// Shadow DDL is isolated inside a rolled-back transaction; no installed object
// is replayed, reset, replaced or dropped. Credentials are never read or printed.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261008100100_arena_crowd_chat.sql'), 'utf8');
const sql = query => execFileSync('docker', ['exec', '-i', 'supabase_db_clash', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: query, encoding: 'utf8' });
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const normalize = value => value.replaceAll('public.arena_actor_hidden_internal(', 'public.arena_actor_hidden(').replace(/\s+/g, ' ').trim();
const ddl = migration.slice(0, migration.indexOf('alter table public.arena_crowd_messages enable'))
  .replaceAll('public.arena_crowd_messages', 'phase05_crowd_verification.arena_crowd_messages');
const compare = sql(`begin;
create schema phase05_crowd_verification;
${ddl}
with relations as (
  select 'public.arena_crowd_messages'::regclass actual,
    'phase05_crowd_verification.arena_crowd_messages'::regclass expected
), columns as (
  select a.attrelid, jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
    pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) value
  from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attnum>0 and not a.attisdropped and a.attrelid in (select actual from relations union select expected from relations)
  group by a.attrelid
), constraints as (
  select conrelid, jsonb_agg(pg_get_constraintdef(oid) order by pg_get_constraintdef(oid)) value
  from pg_constraint where conrelid in (select actual from relations union select expected from relations) group by conrelid
), indexes as (
  select indrelid,jsonb_agg(jsonb_build_array(indisunique,indisprimary,
    (select jsonb_agg(pg_get_indexdef(indexrelid,n,true) order by n) from generate_series(1,indnatts) n),
    pg_get_expr(indpred,indrelid)) order by indisprimary,indisunique,indkey::text) value
  from pg_index where indrelid in (select actual from relations union select expected from relations) group by indrelid
)
select jsonb_build_object('columns',(select value from columns,relations where attrelid=actual)=(select value from columns,relations where attrelid=expected),
 'constraints',(select value from constraints,relations where conrelid=actual)=(select value from constraints,relations where conrelid=expected),
 'indexes',(select value from indexes,relations where indrelid=actual)=(select value from indexes,relations where indrelid=expected));
rollback;`);
const checks = JSON.parse(compare.trim());
for (const [name, equal] of Object.entries(checks)) assert.equal(equal, true, `Crowd ${name} differs from migration`);
const functions = JSON.parse(sql(`select jsonb_agg(jsonb_build_object('name',p.proname,'source',p.prosrc,'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,
 'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute')))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';`).trim());
const definitions = [...migration.matchAll(/create function public\.(\w+)\([\s\S]*?\)\s*returns\s+[\s\S]*?\bas\s+\$\$([\s\S]*?)\$\$;/g)];
assert.equal(definitions.length, 8, 'All Crowd function definitions must be compared');
const expectedFunctions = definitions.map(match => match[0].replace('create function public.', 'create function phase05_crowd_verification.')).join('\n');
const signatures = JSON.parse(sql(`begin;create schema phase05_crowd_verification;
${expectedFunctions}
select jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid)))
from pg_proc p where p.pronamespace='phase05_crowd_verification'::regnamespace;
rollback;`).trim());
const installedSignatures = JSON.parse(sql(`select jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid)))
from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in (${definitions.map(match=>quote(match[1])).join(',')});`).trim());
for (const expected of signatures) assert.deepEqual(installedSignatures.find(s=>s.name===expected.name),expected,`Crowd RPC signature/defaults differ: ${expected.name}`);
for (const match of definitions) {
  const installed = functions.filter(f => f.name === match[1]);
  assert.equal(installed.length, 1, `Ambiguous or missing ${match[1]}`);
  const actual = installed[0];
  assert.equal(normalize(actual.source), normalize(match[2]), `${match[1]} body differs`);
  assert.equal(actual.definer, true); assert.deepEqual(actual.config, ['search_path=""']);
  assert.equal(actual.volatility, /\bstable\b/.test(match[0].slice(0,match[0].indexOf('as $$'))) ? 's' : 'v');
  assert.equal(actual.anon, false, `${match[1]} anon grant differs`);
  assert.equal(actual.authenticated, match[1] !== 'arena_crowd_payload', `${match[1]} authenticated grant differs`);
}
const protection = JSON.parse(sql(`select jsonb_build_object(
 'enum',exists(select 1 from pg_enum where enumtypid='public.report_target'::regtype and enumlabel='arena_crowd_message'),
 'rls',(select relrowsecurity from pg_class where oid='public.arena_crowd_messages'::regclass),
 'policy',(select count(*)=1 from pg_policy where polrelid='public.arena_crowd_messages'::regclass and polname='crowd_member_read' and polcmd='r' and polroles=array['authenticated'::regrole::oid]
    and pg_get_expr(polqual,polrelid) like '%hidden_at IS NULL%' and pg_get_expr(polqual,polrelid) like '%arena_crowd_access(room_id)%' and pg_get_expr(polqual,polrelid) like '%arena_actor_hidden(my_profile_id(), author_id)%'),
 'publication',exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='arena_crowd_messages'),
 'no_anon',not has_any_column_privilege('anon','public.arena_crowd_messages','select'),
 'no_dml',not has_table_privilege('authenticated','public.arena_crowd_messages','insert,update,delete'),
 'safe_columns',(select bool_and(has_column_privilege('authenticated','public.arena_crowd_messages',attname,'select')=(attname<>'request_key')) from pg_attribute where attrelid='public.arena_crowd_messages'::regclass and attnum>0 and not attisdropped),
 'service_read',has_table_privilege('service_role','public.arena_crowd_messages','select'),
 'old_report_private',not has_function_privilege('anon','public.submit_report_before_crowd(public.report_target,text,public.report_reason,text)','execute') and not has_function_privilege('authenticated','public.submit_report_before_crowd(public.report_target,text,public.report_reason,text)','execute'));
`).trim());
for (const [name, valid] of Object.entries(protection)) assert.equal(valid,true,`Crowd protection differs: ${name}`);
console.log('PASS Crowd migration equivalence: table columns/defaults, constraints, indexes, eight function signatures/defaults/bodies/security/grants, RLS, projection, publication and report delegation');
if (process.argv.includes('--repair')) {
  const versions = ['20261008100000','20261008100100'];
  const files = versions.map(version => fs.readdirSync(path.join(__dirname,'../supabase/migrations')).find(file => file.startsWith(version+'_')));
  const records = files.map((file,i) => `insert into supabase_migrations.schema_migrations(version,name,statements) values(${quote(versions[i])},${quote(file.slice(15,-4))},array[${quote(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'))}]) on conflict(version) do nothing;`).join('\n');
  sql('begin;\n'+records+'\ncommit;');
  console.log('PASS verified Crowd versions recorded in the local ledger; installed objects were not replayed');
}
if (process.argv.includes('--record-remediation')) {
  const directory=path.join(__dirname,'../supabase/migrations');
  const files=fs.readdirSync(directory).filter(file=>/^20261008110[0-6]00_.*\.sql$/.test(file)).sort();
  assert.equal(files.length,7,'All seven applied remediation migrations must be present');
  const expected=new Map();
  for(const file of files) for(const match of fs.readFileSync(path.join(directory,file),'utf8')
    .matchAll(/create (?:or replace )?function public\.(\w+)\([\s\S]*?\)\s*returns\s+[\s\S]*?\bas\s+\$\$([\s\S]*?)\$\$;/gi)) expected.set(match[1],match[2]);
  assert.equal(expected.size,12,'All explicit remediation function bodies must be checked');
  for(const [name,source] of expected) {
    const actual=functions.filter(f=>f.name===name);assert.equal(actual.length,1);
    assert.equal(normalize(actual[0].source),normalize(source),`Remediation definition differs: ${name}`);
    assert.equal(actual[0].definer,true);assert.deepEqual(actual[0].config,['search_path=""']);
  }
  const secured=JSON.parse(sql(`select jsonb_build_object(
    'private_helpers',not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('arena_actor_hidden_internal','explore_actor_hidden_internal','vault_profiles_blocked_internal','can_access_vault_drop_internal','can_access_course_lesson_internal','creator_ai_viewer_can_access_internal','creator_live_viewer_can_access_internal','vault_community_viewer_can_access_internal') and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))),
    'profile_projection',not has_table_privilege('anon','public.profiles','select') and not has_column_privilege('anon','public.profiles','auth_user_id','select') and not has_column_privilege('authenticated','public.profiles','coins','select') and not has_column_privilege('authenticated','public.profiles','role','select'),
    'typing_rls',(select relrowsecurity from pg_class where oid='public.arena_room_typing'::regclass),
    'typing_no_direct_access',not has_any_column_privilege('authenticated','public.arena_room_typing','select') and not has_table_privilege('authenticated','public.arena_room_typing','insert,update,delete'),
    'private_topics_view',not has_table_privilege('anon','public.arena_readable_topics','select') and not has_table_privilege('authenticated','public.arena_readable_topics','select'),
    'restrictive_content',(select count(*)=5 from pg_policy where polname in ('removed takes are not public content','replies require a visible source and author','room messages require visible content','room evidence requires visible content','canonical topic copies require visible source') and not polpermissive),
    'private_typing_policy',exists(select 1 from pg_policy where polrelid='realtime.messages'::regclass and polname='members receive server typing hints' and polcmd='r'),
    'crew_no_anon',not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%crew%' and has_function_privilege('anon',p.oid,'execute')));`).trim());
  for(const [name,valid] of Object.entries(secured))assert.equal(valid,true,`Remediation protection differs: ${name}`);
  const records=files.map(file=>`insert into supabase_migrations.schema_migrations(version,name,statements) values(${quote(file.slice(0,14))},${quote(file.slice(15,-4))},array[${quote(fs.readFileSync(path.join(directory,file),'utf8'))}]) on conflict(version) do nothing;`).join('\n');
  const topicFile=files.find(file=>file.startsWith('20261008110600_'));
  const topicSource=fs.readFileSync(path.join(directory,topicFile),'utf8');
  assert.ok(topicSource.indexOf("definition:=pg_get_functiondef('public.get_arena_topic(text)'")>topicSource.indexOf('end loop;'), 'Scheduled compatibility guard must follow the discovery rewrite');
  const installedTopic=functions.find(f=>f.name==='get_arena_topic').source;
  assert.ok(installedTopic.includes("from public.arena_daily_topics where id=p_topic_id and status='scheduled'"));
  assert.ok(installedTopic.includes('from public.arena_readable_topics where id = p_topic_id'));
  // Keep the final verified statement text for this migration's ordering fix.
  const topicRecord=`update supabase_migrations.schema_migrations set statements=array[${quote(topicSource)}] where version='20261008110600';`;
  sql('begin;\n'+records+'\n'+topicRecord+'\ncommit;');
  console.log('PASS applied remediation function bodies/security, content policies, private typing and effective grants verified before recording local versions');
}
