// Repository-only checks. Does not compile/execute SQL or connect to Supabase.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const migrations = fs.readdirSync('supabase/migrations').filter(n => n.endsWith('.sql')).sort();
const suites = fs.readdirSync('supabase/tests').filter(n => /^\d+_.*\.sql$/.test(n));
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const read = f => fs.readFileSync(f, 'utf8');
const git = args => execFileSync('git', ['-c', 'safe.directory=' + process.cwd().replaceAll('\\','/'), ...args], { encoding: 'utf8' });
check('migration version prefixes unique', () => assert.equal(new Set(migrations.map(n => n.split('_')[0])).size, migrations.length));
check('SQL suite prefixes unique with safety 086', () => {
 assert.equal(new Set(suites.map(n => n.split('_')[0])).size, suites.length);
 assert.ok(suites.includes('086_safety_settings.sql')); assert.ok(!suites.includes('084_safety_settings.sql'));
});
check('main migration Git blobs unchanged', () => {
 const files = git(['ls-tree','-r','--name-only','origin/main','--','supabase/migrations']).trim().split('\n');
 for (const file of files) assert.equal(git(['hash-object',file]).trim(),git(['rev-parse','origin/main:'+file]).trim(),file);
});
check('pending PR migration Git blobs unchanged', () => {
 for (const n of [13,14,21,23,24]) {
  const files = git(['diff','--name-only','origin/main...origin/integration-pr'+n,'--','supabase/migrations']).trim().split('\n').filter(Boolean);
  for (const file of files) assert.equal(git(['hash-object',file]).trim(),git(['rev-parse','origin/integration-pr'+n+':'+file]).trim(),file);
 }
});
check('M1 profile-history anchor still unique in final baseline definition', () => {
 const defs = migrations.filter(n => /profile_clash_list/.test(read('supabase/migrations/'+n)) && !/m1_clash_verdict/.test(n));
 const last = defs.reverse().find(n => /create or replace function public\.profile_clash_list\(p_profile_id text\)/i.test(read('supabase/migrations/'+n)));
 let source = read('supabase/migrations/'+last).split(/create or replace function public\.profile_clash_list\(p_profile_id text\)/i)[1].split('$$;')[0];
 const visibilityPatch = read('supabase/migrations/20261008110200_arena_content_visibility.sql');
 assert.ok(visibilityPatch.includes("'where c.challenger_id = p_profile_id or t.author_id = p_profile_id'"));
 assert.ok(visibilityPatch.includes("'where (c.challenger_id = p_profile_id or t.author_id = p_profile_id) and public.arena_take_readable(t.id) and not public.arena_actor_hidden_internal(public.my_profile_id(),c.challenger_id)'"));
 source = source.replace('where c.challenger_id = p_profile_id or t.author_id = p_profile_id', 'where (c.challenger_id = p_profile_id or t.author_id = p_profile_id) and public.arena_take_readable(t.id) and not public.arena_actor_hidden_internal(public.my_profile_id(),c.challenger_id)');
 assert.equal(source.split('(c.challenger_id = p_profile_id or t.author_id = p_profile_id)').length-1,1);
});
check('profile stats visibility addition follows M1 and retains filters', () => {
 const name = migrations.find(n => n.endsWith('_profile_stats_clash_visibility.sql'));
 assert.ok(name > '20261011081531_m1_clash_verdict_visibility.sql');
 const sql = read('supabase/migrations/'+name);
 for (const text of ["and public.clash_readable(c.id)","and public.arena_take_readable(t.id)","and not public.arena_actor_hidden_internal(v_viewer, c.challenger_id)","stats.proowner = gate.proowner","set search_path = ''","when v.winner_side = 'DRAW'"]) assert.ok(sql.includes(text),text);
 assert.ok(!/alter\s+(table|policy)|grant\s+all/i.test(sql));
});
check('H1/H2, H3 and M1 fail-closed controls remain present', () => {
 const h1=read('supabase/migrations/20261011053717_critical_authorization_hardening.sql');
 assert.match(h1,/revoke execute[\s\S]*from public, anon, authenticated, service_role/);
 assert.match(h1,/revoke select on table public.course_lessons/);
 const h3=read('supabase/migrations/20261011074540_h3_reputation_history_privacy.sql');
 assert.match(h3,/as restrictive for select to authenticated/); assert.match(h3,/profile_id = \(select public.my_profile_id\(\)\)/);
 const m1=read('supabase/migrations/20261011081531_m1_clash_verdict_visibility.sql');
 assert.equal((m1.match(/as restrictive for select to anon, authenticated/g)||[]).length,2);
 assert.match(m1,/public.arena_room_readable\(r.id\)/); assert.match(m1,/unexpected trusted function owner/);
});
check('superseding E2E harness is rollback-default and opt-in', () => {
 const sql=read('scripts/phase11_arena_e2e_validation.sql');
 assert.match(sql,/app.phase11_e2e_allow/); assert.match(sql,/create temporary table/);
 assert.match(sql,/\\else[\s\S]*rollback;/); assert.match(sql,/app.phase11_e2e_persist/);
});
check('all SQL dollar-quoted blocks lexically balanced', () => {
 // Lightweight lexer, NOT PostgreSQL compilation or PL/pgSQL semantic checking.
 for (const name of migrations) {
  const sql=read('supabase/migrations/'+name); let i=0;
  while(i<sql.length) {
   if(sql.startsWith('--',i)){ const end=sql.indexOf('\n',i); i=end<0?sql.length:end+1; continue; }
   if(sql.startsWith('/*',i)){ let depth=1;i+=2;while(i<sql.length&&depth){if(sql.startsWith('/*',i)){depth++;i+=2;}else if(sql.startsWith('*/',i)){depth--;i+=2;}else i++;}assert.equal(depth,0,name);continue; }
   if(sql[i]==="'"||sql[i]==='"'){const quote=sql[i++];let closed=false;while(i<sql.length){if(sql[i]===quote){if(sql[i+1]===quote){i+=2;continue;}i++;closed=true;break;}if(sql[i]==='\\')i++;i++;}assert.ok(closed,name);continue;}
   const tag=sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
   if(tag){const end=sql.indexOf(tag,i+tag.length);assert.notEqual(end,-1,name+' '+tag);i=end+tag.length;}else i++;
  }
 }
});
console.log(`${checks}/${checks} repository-only integration checks passed; ${migrations.length} migrations, ${suites.length} SQL suites. SQL NOT EXECUTED.`);
