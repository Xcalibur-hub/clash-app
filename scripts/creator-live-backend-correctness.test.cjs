// Offline source-contract checks only. PostgreSQL/role/concurrency acceptance
// lives in the companion SQL/spec files and must never be inferred from these.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path='supabase/migrations/20261031161138_creator_live_correctness.sql';
const sql=fs.readFileSync(path,'utf8');
const old=fs.readFileSync('supabase/migrations/20261005100100_creator_live_rpcs.sql','utf8').replaceAll('\r\n','\n');
const defs=Object.fromEntries([...sql.matchAll(/create or replace function public\.(\w+)\([\s\S]*?\n\$\$;/g)].map(m=>[m[1],m[0]]));
function before(body,a,b){assert.ok(body.indexOf(a)>=0,a);assert.ok(body.indexOf(b)>body.indexOf(a),`${a} must precede ${b}`);}
test('new hosting is unconditionally closed without effects; signatures are preserved',()=>{
 const create=defs.create_creator_live_session,start=defs.start_creator_live_session;
 assert.match(create,/errcode='P0006'/);assert.doesNotMatch(create,/insert into|assert_rate_limit/);
 assert.doesNotMatch(start,/insert into|update public|play_notify|assert_rate_limit/);
 before(start,"if v_row.status = 'LIVE'", "new hosting is deferred");
 for(const [name,body] of Object.entries(defs))if(old.includes(`function public.${name}(`)){
   const original=old.slice(old.indexOf(`create or replace function public.${name}(`));
   assert.equal(body.slice(0,body.indexOf('as $$')),original.slice(0,original.indexOf('as $$')),name);
 }
});
test('continuation has explicit expiring evidence and no public grant/backfill',()=>{
 assert.match(sql,/evidence_ref text not null/);assert.match(sql,/revoked_at timestamptz/);
 assert.match(sql,/continuation_approvals enable row level security/);
 assert.match(sql,/revoke all on table public.creator_live_continuation_approvals from public, anon, authenticated, service_role/);
 assert.doesNotMatch(sql,/insert into public.creator_live_continuation_approvals/i);
 assert.match(defs.assert_creator_live_continuation,/for share;/);
 before(defs.assert_creator_live_continuation,'for share;','v_approval.expires_at <= clock_timestamp()');
 assert.match(defs.assert_creator_live_continuation,/is distinct from public.my_profile_id\(\)/);
 assert.doesNotMatch(defs.creator_live_continuation_allowed,/creator_live_viewers|creator_live_votes/);
});
test('end/open and vote/close acquire parent before child; host open requires evidence',()=>{
 assert.match(defs.create_creator_live_interaction,/where id = p_session_id for update;/);
 before(defs.create_creator_live_interaction,"'HOST'",'insert into public.creator_live_interactions');
 for(const n of ['submit_creator_live_vote','creator_live_close_interaction']){
   before(defs[n],'select * into v_session','select * into v_row');
   assert.match(defs[n],/for update;/);
 }
});
test('replay renews visibility and approval before returning authoritative own option',()=>{
 const vote=defs.submit_creator_live_vote;
 before(vote,'creator_live_viewer_can_access_internal',"'alreadyVoted', true");
 before(vote,'assert_creator_live_continuation',"'alreadyVoted', true");
 before(vote,"v_session.status='CANCELLED'","'alreadyVoted', true");
 assert.match(vote,/'myVote', v_existing/);assert.match(vote,/'myVote', v_option/);
 before(vote,"'alreadyVoted', true",'assert_rate_limit');
});
test('deadline and entitlement checks use wall clock after rate-limit contention',()=>{
 const vote=defs.submit_creator_live_vote;
 const final=vote.slice(vote.indexOf('perform public.assert_rate_limit'));
 before(final,'assert_creator_live_continuation','insert into public.creator_live_votes');
 before(final,'v_row.closes_at <= clock_timestamp()','insert into public.creator_live_votes');
 assert.match(final,/current_period_end > clock_timestamp\(\)/);
 assert.doesNotMatch(vote,/closes_at <= now\(\)/);
});
test('terminal close/end are effect-free on replay and neutralize ties',()=>{
 before(defs.end_creator_live_session,"status in ('ENDED','CANCELLED')",'update public.creator_live_sessions');
 before(defs.creator_live_close_interaction,'closed_at is not null','insert into public.creator_live_events');
 assert.match(defs.creator_live_close_interaction,/jsonb_set\(v_result, '\{winner\}', 'null'::jsonb\)/);
 assert.match(defs.creator_live_close_interaction,/'NO_BALLOTS'/);assert.match(defs.creator_live_close_interaction,/'TIE'/);
 assert.match(defs.end_creator_live_session,/status in \('OPEN','TRIGGERED'\)/);
});
test('capability cards and heartbeat do not infer admission from readable content',()=>{
 for(const n of ['creator_live_session_card','creator_live_interaction_card'])assert.match(defs[n],/creator_live_continuation_allowed/);
 before(defs.touch_creator_live_viewer,'assert_creator_live_continuation','insert into public.creator_live_viewers');
});
test('snapshot is read-only, caller-scoped, bounded and not a lossless event cursor',()=>{
 const s=defs.get_creator_live_snapshot;
 assert.match(s,/stable security definer set search_path = ''/);
 assert.match(s,/creator_live_viewer_can_access_internal\(p_session_id,v_viewer\)/);
 assert.match(s,/p_interaction_id is null or x.id=p_interaction_id/);
 assert.match(s,/limit 40/);assert.match(s,/'interactionWindowComplete'/);
 assert.doesNotMatch(s,/\b(insert|update|delete)\b/i);
 assert.doesNotMatch(sql,/create or replace function public\.(report_creator_live_session|creator_live_events_since|creator_live_viewer_can_access)\(/);
});
test('SQL suite uses actual roles, explicit rollback and strong security expectations',()=>{
 const s=fs.readFileSync('supabase/tests/creator_live_correctness.pgtap.sql','utf8');
 assert.match(s,/set local role authenticated;/);assert.match(s,/rollback;\s*$/);
 for(const scenario of ['blocked ballot replay','revoked continuation','exactly two authoritative ballots','zero ballots','no additional sessions','denial left no events'])assert.ok(s.includes(scenario),scenario);
 assert.doesNotMatch(s,/\bskip\s*\(/i);
});
test('independent-session spec includes bounded lock waits, both end/open orders, duplicates and deadline wait',()=>{
 const s=fs.readFileSync('supabase/tests/creator_live_correctness.spec','utf8');
 assert.equal((s.match(/^permutation /gm)||[]).length,10);
 for(const step of ['o_open_denied','o_verify_end','o_verify_vote','v_deadline','o_verify_deadline'])assert.ok(s.includes(step));
 assert.match(s,/statement_timeout='10s'/);assert.match(s,/lock_timeout='8s'/);
 assert.match(s,/pg_sleep\(2\)/);assert.match(s,/session "other_viewer"/);
 for(const step of ['o_approval_expiry','o_rate_lock','o_sub_arm','r_revoke','o_wait_viewer','o_wait_revoker','o_verify_denied'])assert.ok(s.includes(step));
 assert.match(s,/pg_blocking_pids/);assert.match(s,/pg_advisory_xact_lock/);
});
test('closed admission retains owner/media/provider validation without performing writes',()=>{
 const s=defs.create_creator_live_session;
 for(const predicate of ['v_media.owner_id is distinct from v_creator',"v_media.visibility is distinct from 'public'","v_media.bucket is distinct from 'public-media'","v_stream !~ '^https://'","p_provider not in ('standby', 'hls', 'file', 'embed')"]){
   assert.ok(s.includes(predicate));before(s,predicate,'new hosting is deferred');
 }
 assert.doesNotMatch(s,/\b(insert|update|delete)\b/i);
});
test('historical harness retains security assertions and uses explicit rollback continuation evidence',()=>{
 const s=fs.readFileSync('supabase/tests/043_creator_live.sql','utf8');
 for(const label of ['private media is refused as a cover','a real provider needs an https url','another creator cannot end this session','another creator cannot open an interaction','exactly one vote row exists for the viewer','the action fired exactly once','an expired subscription cannot take part','a blocked creator is invisible','a visible session can be reported','the watch roster is never readable'])assert.ok(s.includes(label),label);
 assert.match(s,/P0006.*new start remains closed/);
 assert.match(s,/insert into public.creator_live_continuation_approvals/);
 assert.match(s,/rollback;\s*$/);assert.doesNotMatch(s,/\bskip\s*\(/i);
});
// Recognizes the native spec's block delimiters, not PostgreSQL SQL grammar.
// Native isolationtester cannot escape a '}' even inside an SQL string.
function specStructure(text){
 let rest=text;const steps=new Set(),permutations=[];
 while(rest.trim()){
   rest=rest.replace(/^\s+/,'');if(rest.startsWith('#')){rest=rest.slice(rest.indexOf('\n')+1);continue;}
   const m=rest.match(/^(setup|teardown|session|step|permutation)\b/);assert.ok(m,'invalid native spec header near '+rest.slice(0,35));
   const kind=m[1];rest=rest.slice(m[0].length).replace(/^\s+/,'');
   if(kind==='permutation'){
     const end=rest.indexOf('\n');const line=end<0?rest:rest.slice(0,end);rest=end<0?'':rest.slice(end+1);
     const names=[...line.matchAll(/"([^"]+)"/g)].map(m=>m[1]);assert.ok(names.length);permutations.push(names);continue;
   }
   if(kind==='session'||kind==='step'){
     const name=rest.match(/^"([^"]+)"/);assert.ok(name);rest=rest.slice(name[0].length).replace(/^\s+/,'');
     if(kind==='session')continue;assert.ok(!steps.has(name[1]),'duplicate step');steps.add(name[1]);
   }
   assert.ok(rest.startsWith('{'));const end=rest.indexOf('}');assert.ok(end>=0,'unterminated SQL block');
   const body=rest.slice(1,end);assert.ok(!body.includes('{'),'literal brace cannot appear in native SQL block');rest=rest.slice(end+1);
 }
 for(const names of permutations)for(const n of names)assert.ok(steps.has(n),'unknown step '+n);
 return permutations.length;
}
test('native isolation spec has valid block boundaries and declared bounded permutations',()=>{
 assert.equal(specStructure(fs.readFileSync('supabase/tests/creator_live_correctness.spec','utf8')),10);
 assert.throws(()=>specStructure('setup { SELECT \'{"x":1}\'; }'));
});
test('SQL coverage includes staff safety and exactly-once TRIGGERED finalization',()=>{
 const s=fs.readFileSync('supabase/tests/creator_live_correctness.pgtap.sql','utf8');
 for(const label of ['staff finalizes retained TRIGGERED','staff terminal cleanup is idempotent','finalization does not refire retained action','staff cleanup did not create admission evidence'])assert.ok(s.includes(label),label);
 const spec=fs.readFileSync('supabase/tests/creator_live_correctness.spec','utf8');
 assert.match(spec,/DELETE FROM public\.profiles WHERE id IN \('b2iso-host','b2iso-viewer'\)/);
 assert.match(spec,/denied request left partial authoritative effects/);
});
test('captured native output checker rejects false green exits, missing waits and SQL errors',()=>{
 const {checkOutput}=require('./creator-live-isolation-output-check.cjs');
 const spec=fs.readFileSync('supabase/tests/creator_live_correctness.spec','utf8');
 const runs=[...spec.matchAll(/^permutation (.+)$/gm)].map(m=>[...m[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]));
 const waits=['o_end','o_open_denied','h_close','w_vote','v_deadline','v_approval_denied','v_approval_denied','r_revoke','v_subscription_denied','v_deadline'];
 // Synthetic transcript tests validate only this checker, never PostgreSQL.
 const stdout=runs.map((steps,i)=>'starting permutation: '+steps.join(' ')+'\n'+steps.map(s=>'step '+s+': SELECT 1;'+(s===waits[i]?' <waiting ...>\nstep '+s+': <... completed>':'')).join('\n')+'\n').join('');
 const args={stdout,stderr:'',status:0,spec};assert.equal(checkOutput(args).permutations,10);
 assert.throws(()=>checkOutput({...args,status:1}));
 assert.throws(()=>checkOutput({...args,stderr:'teardown failed: refused cleanup'}));
 assert.throws(()=>checkOutput({...args,stdout:stdout+'ERROR: assertion failed\n'}));
 assert.throws(()=>checkOutput({...args,stdout:stdout.replace(' <waiting ...>','')}));
 assert.throws(()=>checkOutput({...args,stdout:stdout.slice(0,stdout.lastIndexOf('starting permutation:'))}));
});
