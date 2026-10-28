#!/usr/bin/env node
/**
 * Phase 6G.1 — genuine concurrent PostgreSQL sessions for Meet NEW-admission gate.
 * Two independent `psql` clients. No mocked concurrency.
 * Requires migration 20261028210000 applied on an explicitly authorized disposable DB.
 * Phase 6G.4 pins the verified replacement container; no target override is allowed.
 */
const { spawnSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CONTAINER = '63f492e65faa06db227475973c99d3ea05ad240abb6d4f61e16bc6e38afc910b';
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.tmp', 'phase6g4-meet-admission-pg', 'concurrency-results.json');

function psql(sql) {
  const r = spawnSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-c', sql],
    { encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 10 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    const err = new Error((r.stderr || r.stdout || 'psql failed').trim());
    err.stdout = r.stdout;
    err.stderr = r.stderr;
    throw err;
  }
  return (r.stdout || '').trim();
}

function psqlScript(lines) {
  for (const sql of lines) psql(sql);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let sequence = 0;
function backgroundPsql(sql) {
  const started = Date.now();
  sql = `set application_name='g4_${++sequence}'; set lock_timeout='8s'; set statement_timeout='12s'; select 'backend:'||pg_backend_pid();\n` + sql;
  return new Promise((resolve) => {
    const child = spawn(
      'docker',
      ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
      { windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, elapsedMs: Date.now() - started, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.stdin.write(sql);
    child.stdin.end();
  });
}


function activity(label) {
  return JSON.parse(psql(`select coalesce(json_agg(json_build_object('pid',pid,'wait',wait_event,'waitType',wait_event_type,'blockers',pg_blocking_pids(pid))), '[]') from pg_stat_activity where application_name='${label}'`))[0];
}
async function observe(label, test) {
  for(let i=0;i<40;i++){const row=activity(label);if(row && test(row))return row;await sleep(50);}
  throw Error('UNVERIFIED overlap: '+label);
}

function profileId(authUuid) {
  return psql(`select id from public.profiles where auth_user_id='${authUuid}'`);
}

function asUserSql(authUuid) {
  return [
    `select set_config('request.jwt.claim.sub', '${authUuid}', true);`,
    'set local role authenticated;',
    `select set_config('request.jwt.claims', '{"sub":"${authUuid}","role":"authenticated"}', true);`,
  ].join('\n');
}

async function bootstrap() {
  const authIds = [
    '64100000-0000-4000-8000-000000000001',
    '64100000-0000-4000-8000-000000000002',
    '64100000-0000-4000-8000-000000000003',
  ];
  if (psql(`select count(*) from auth.users where id in ('${authIds.join("','")}')`) !== '0') throw Error('STOP: fixture identities already exist');
  if (psql("select count(*) from public.meet_sessions where id='ms_6g4c_next'") !== '0' || psql("select count(*) from public.meet_queue where id like 'mq_6g4c_%'") !== '0') throw Error('STOP: fixture rows already exist');
  psqlScript([
    `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
      ('64100000-0000-4000-8000-000000000001','authenticated','authenticated','ca6g1@example.invalid',extensions.crypt('x', extensions.gen_salt('bf')), now(), '{}'::jsonb,'{}'::jsonb, now(), now()),
      ('64100000-0000-4000-8000-000000000002','authenticated','authenticated','cb6g1@example.invalid',extensions.crypt('x', extensions.gen_salt('bf')), now(), '{}'::jsonb,'{}'::jsonb, now(), now()),
      ('64100000-0000-4000-8000-000000000003','authenticated','authenticated','cc6g1@example.invalid',extensions.crypt('x', extensions.gen_salt('bf')), now(), '{}'::jsonb,'{}'::jsonb, now(), now());`,
    "update public.profiles set handle='p6g4_ca', name='Admit Conc A' where auth_user_id='64100000-0000-4000-8000-000000000001';",
    "update public.profiles set handle='p6g4_cb', name='Admit Conc B' where auth_user_id='64100000-0000-4000-8000-000000000002';",
    "update public.profiles set handle='p6g4_cc', name='Admit Conc C' where auth_user_id='64100000-0000-4000-8000-000000000003';",
  ]);
}

async function caseCancelWinsUnderGate() {
  const a = profileId('64100000-0000-4000-8000-000000000001');
  const b = profileId('64100000-0000-4000-8000-000000000002');
  psqlScript([
    `delete from public.meet_participants where profile_id in ('${a}','${b}');`,
    `delete from public.meet_queue where profile_id in ('${a}','${b}');`,
    `insert into public.meet_queue (id, profile_id, mode, channel, status) values ('mq_6g4c_a1','${a}','ANYWHERE','TEXT','waiting');`,
    `insert into public.meet_queue (id, profile_id, mode, channel, status) values ('mq_6g4c_b1','${b}','ANYWHERE','TEXT','waiting');`,
  ]);

  const sessionsBefore = Number(psql('select count(*) from public.meet_sessions'));
  const holder = backgroundPsql(`
begin;
select id from public.meet_queue where id='mq_6g4c_a1' for update;
select pg_sleep(3);
${asUserSql('64100000-0000-4000-8000-000000000001')}
select public.cancel_meet_search('mq_6g4c_a1');
commit;
`);
  const holderActivity = await observe('g4_1', r => r.wait === 'PgSleep');
  const matcherPromise = backgroundPsql(`
begin;
set local role service_role;
select public.try_meet_match('mq_6g4c_a1');
commit;
`);
  const contention = await observe('g4_2', r => r.waitType === 'Lock' && r.blockers.includes(holderActivity.pid));
  const matcher = await matcherPromise;
  const holderResult = await holder;
  const sessionsAfter = Number(psql('select count(*) from public.meet_sessions'));
  const aStatus = psql("select status::text from public.meet_queue where id='mq_6g4c_a1'");
  return {
    name: 'cancel_wins_under_admission_gate', holderActivity, contention,
    holderCode: holderResult.code,
    matcherCode: matcher.code,
    holderStdout: holderResult.stdout,
    matcherStdout: matcher.stdout,
    aStatus,
    sessionsCreated: sessionsAfter - sessionsBefore,
    pass:
      holderResult.code === 0 &&
      matcher.code === 0 &&
      aStatus === 'cancelled' &&
      sessionsAfter === sessionsBefore &&
      /"matched"\s*:\s*false/.test(matcher.stdout) &&
      /cancelled_waiting/.test(holderResult.stdout),
  };
}

async function caseMatcherDeferredNoSession() {
  const a = profileId('64100000-0000-4000-8000-000000000001');
  const b = profileId('64100000-0000-4000-8000-000000000002');
  psqlScript([
    `delete from public.meet_participants where profile_id in ('${a}','${b}');`,
    `delete from public.meet_queue where profile_id in ('${a}','${b}');`,
    `insert into public.meet_queue (id, profile_id, mode, channel, status) values ('mq_6g4c_a2','${a}','ANYWHERE','TEXT','waiting');`,
    `insert into public.meet_queue (id, profile_id, mode, channel, status) values ('mq_6g4c_b2','${b}','ANYWHERE','TEXT','waiting');`,
  ]);

  const sessionsBefore = Number(psql('select count(*) from public.meet_sessions'));
  const matcher = backgroundPsql(`
begin;
set local role service_role;
select public.try_meet_match('mq_6g4c_a2');
select pg_sleep(2);
commit;
`);
  const holderActivity = await observe('g4_3', r => r.wait === 'PgSleep');
  const cancelPromise = backgroundPsql(`
begin;
${asUserSql('64100000-0000-4000-8000-000000000001')}
select public.cancel_meet_search('mq_6g4c_a2');
commit;
`);
  const contention = await observe('g4_4', r => r.waitType === 'Lock' && r.blockers.includes(holderActivity.pid));
  const cancel = await cancelPromise;
  const matcherResult = await matcher;
  const sessionsAfter = Number(psql('select count(*) from public.meet_sessions'));
  const aStatus = psql("select status::text from public.meet_queue where id='mq_6g4c_a2'");
  return {
    name: 'matcher_deferred_cancel_still_exits', holderActivity, contention,
    matcherCode: matcherResult.code,
    cancelCode: cancel.code,
    matcherStdout: matcherResult.stdout,
    cancelStdout: cancel.stdout,
    aStatus,
    sessionsCreated: sessionsAfter - sessionsBefore,
    pass:
      matcherResult.code === 0 &&
      cancel.code === 0 &&
      sessionsAfter === sessionsBefore &&
      /admission_deferred|"matched"\s*:\s*false/.test(matcherResult.stdout) &&
      aStatus === 'cancelled' &&
      /cancelled_waiting|already_terminal/.test(cancel.stdout),
  };
}

async function caseJoinDeniedWhileCancelOther() {
  const a = profileId('64100000-0000-4000-8000-000000000001');
  const c = profileId('64100000-0000-4000-8000-000000000003');
  psqlScript([
    `delete from public.meet_queue where profile_id in ('${a}','${c}');`,
    `insert into public.meet_queue (id, profile_id, mode, channel, status) values ('mq_6g4c_c3','${c}','ANYWHERE','TEXT','waiting');`,
  ]);
  const queuesBefore = Number(psql(`select count(*) from public.meet_queue where profile_id='${a}'`));
  const join = backgroundPsql(`
begin;
${asUserSql('64100000-0000-4000-8000-000000000001')}
select pg_sleep(2);
select public.join_meet_queue('ANYWHERE'::public.meet_match_mode, null, null, '{}'::text[], 'TEXT'::public.meet_channel);
commit;
`);
  const cancel = backgroundPsql(`
begin;
${asUserSql('64100000-0000-4000-8000-000000000003')}
select pg_sleep(2);
select public.cancel_meet_search('mq_6g4c_c3');
commit;
`);
  const joinActivity=await observe('g4_5',r=>r.wait==='PgSleep');
  const cancelActivity=await observe('g4_6',r=>r.wait==='PgSleep');
  if(joinActivity.pid===cancelActivity.pid)throw Error('not independent');
  const [joinResult, cancelResult] = await Promise.all([join, cancel]);
  const queuesAfter = Number(psql(`select count(*) from public.meet_queue where profile_id='${a}'`));
  const cStatus = psql("select status::text from public.meet_queue where id='mq_6g4c_c3'");
  return {
    name: 'join_denied_concurrent_cancel_other', transactionOverlap:[joinActivity,cancelActivity], lockContentionExpected:false,
    joinCode: joinResult.code,
    cancelCode: cancelResult.code,
    joinStderr: joinResult.stderr,
    joinStdout: joinResult.stdout,
    cancelStdout: cancelResult.stdout,
    queuesDelta: queuesAfter - queuesBefore,
    cStatus,
    pass:
      joinResult.code !== 0 &&
      /admission deferred|P0006/i.test(joinResult.stderr + joinResult.stdout) &&
      cancelResult.code === 0 &&
      cStatus === 'cancelled' &&
      queuesAfter === queuesBefore &&
      /cancelled_waiting/.test(cancelResult.stdout),
  };
}


async function caseNextContinuation() {
 const a=profileId('64100000-0000-4000-8000-000000000001'), b=profileId('64100000-0000-4000-8000-000000000002');
 psql(`begin; insert into public.meet_sessions(id,mode,channel,status,created_at,expires_at) values('ms_6g4c_next','ANYWHERE','TEXT','active',now(),now()+interval '20 minutes'); insert into public.meet_participants(session_id,profile_id,seat,alias) values('ms_6g4c_next','${a}','A','Fictional A'),('ms_6g4c_next','${b}','B','Fictional B'); commit;`);
 const before=psql('select count(*) from public.meet_sessions');
 const heartbeat=backgroundPsql(`begin; ${asUserSql('64100000-0000-4000-8000-000000000002')} select public.touch_meet_session('ms_6g4c_next'); select pg_sleep(3); commit;`);
 const holder=await observe('g4_7',r=>r.wait==='PgSleep');
 const next=await backgroundPsql(`begin; ${asUserSql('64100000-0000-4000-8000-000000000001')} select public.next_meet('ms_6g4c_next','ANYWHERE'); commit;`);
 const during=activity('g4_7'); const beat=await heartbeat;
 const state=psql("select status||'|'||(select count(*) from public.meet_participants where session_id='ms_6g4c_next' and left_at is null) from public.meet_sessions where id='ms_6g4c_next'");
 return {name:'next_denied_before_exit_while_heartbeat_holds_lock',holder,holderAtDenial:during,next,beat,state,pass:!!during && during.pid===holder.pid && during.wait==='PgSleep' && next.code!==0 && /admission deferred/.test(next.stderr) && beat.code===0 && state==='active|2' && before===psql('select count(*) from public.meet_sessions')};
}
function cleanupOwnFixtures(){
 const ids="'64100000-0000-4000-8000-000000000001','64100000-0000-4000-8000-000000000002','64100000-0000-4000-8000-000000000003'";
 psql(`begin; delete from public.meet_participants where profile_id in(select id from public.profiles where auth_user_id in(${ids})); delete from public.meet_sessions where id='ms_6g4c_next'; delete from public.meet_queue where profile_id in(select id from public.profiles where auth_user_id in(${ids})); delete from public.profiles where auth_user_id in(${ids}); delete from auth.users where id in(${ids}); commit;`);
}

async function casePollCancellation() {
  const a=profileId('64100000-0000-4000-8000-000000000001'), b=profileId('64100000-0000-4000-8000-000000000002');
  // The earlier Next case has a legacy fixture; leave it explicitly before this case.
  psql(`begin; ${asUserSql('64100000-0000-4000-8000-000000000001')} select public.leave_meet_session('ms_6g4c_next','leave'); commit;`);
  psql(`begin; delete from public.meet_queue where profile_id in('${a}','${b}'); insert into public.meet_queue(id,profile_id,mode,channel,status) values('mq_6g4c_poll_a','${a}','ANYWHERE','TEXT','waiting'),('mq_6g4c_poll_b','${b}','ANYWHERE','TEXT','waiting'); commit;`);
  const before=psql('select count(*) from public.meet_sessions');
  const holder=backgroundPsql(`begin; select id from public.meet_queue where id='mq_6g4c_poll_a' for update; select pg_sleep(3); ${asUserSql('64100000-0000-4000-8000-000000000001')} select public.cancel_meet_search('mq_6g4c_poll_a'); commit;`);
  const h=await observe('g4_9',r=>r.wait==='PgSleep');
  const poll=backgroundPsql(`begin; ${asUserSql('64100000-0000-4000-8000-000000000001')} select public.poll_meet_queue(); commit;`);
  const contention=await observe('g4_10',r=>r.waitType==='Lock' && r.blockers.includes(h.pid));
  const [cancelResult,pollResult]=await Promise.all([holder,poll]);
  const state=psql("select status from public.meet_queue where id='mq_6g4c_poll_a'");
  return {name:'actual_poll_waits_for_cancellation_without_matching',holder:h,contention,cancelResult,pollResult,state,pass:cancelResult.code===0 && pollResult.code===0 && /"matched"\s*:\s*false/.test(pollResult.stdout) && state==='cancelled' && before===psql('select count(*) from public.meet_sessions')};
}

async function main() {
  const identity = {
    container: CONTAINER,
    systemIdentifier: psql('select system_identifier from pg_control_system()'),
    expectedSystemIdentifier: '7701628855711424555',
    note: 'Do not run unless owner explicitly authorizes 6G.1 mutations on this stack',
  };
  if (identity.systemIdentifier !== identity.expectedSystemIdentifier) {
    throw new Error(`Refusing concurrency run: system id ${identity.systemIdentifier} is not the reconfirmed 6F.5 disposable`);
  }
  if(psql("select count(*) from supabase_migrations.schema_migrations where version='20261028210000'")!=='1' || psql('select public.meet_new_admission_allowed()')!=='f' || psql('select count(*) from cron.job where active')!=='0')throw Error('gate or cron baseline mismatch');
  await bootstrap();
  const results = [];
  try {
  results.push(await caseCancelWinsUnderGate());
  results.push(await caseMatcherDeferredNoSession());
  results.push(await caseJoinDeniedWhileCancelOther());
  results.push(await caseNextContinuation());
  results.push(await casePollCancellation());
  } finally { cleanupOwnFixtures(); }
  const summary = {
    identity,
    results,
    passCount: results.filter((r) => r.pass).length,
    failCount: results.filter((r) => !r.pass).length,
    allPass: results.every((r) => r.pass),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.allPass ? 0 : 1;
}

main().catch((err) => {
  console.error(String(err.stack || err));
  if (err.stdout) console.error('STDOUT', err.stdout);
  if (err.stderr) console.error('STDERR', err.stderr);
  process.exitCode = 1;
});
