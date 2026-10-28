#!/usr/bin/env node
/**
 * Phase 6F.5 — genuine concurrent PostgreSQL sessions for cancel_meet_search.
 * Two independent `psql` clients inside the disposable DB container.
 * Coordination uses committed timing after lock acquisition (no uncommitted barrier).
 */
const { spawnSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CONTAINER = process.env.CLASH_6F5_DB_CONTAINER || 'supabase_db_clash-6f5-meet-cancel';
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.tmp', 'phase6f5-meet-cancel-pg', 'concurrency-results.json');

function psql(sql) {
  const r = spawnSync(
    'docker',
    ['exec', '-e', 'PGPASSWORD=postgres', '-i', CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-c', sql],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
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

function backgroundPsql(sql) {
  return new Promise((resolve) => {
    const child = spawn(
      'docker',
      ['exec', '-e', 'PGPASSWORD=postgres', '-i', CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
      { windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.stdin.write(sql);
    child.stdin.end();
  });
}

function profileId(authUuid) {
  return psql(`select id from public.profiles where auth_user_id='${authUuid}'`);
}

function asUserSql(authUuid) {
  return [
    `select set_config('request.jwt.claim.sub', '${authUuid}', true);`,
    `select set_config('request.jwt.claims', '{"sub":"${authUuid}","role":"authenticated"}', true);`,
  ].join('\n');
}

async function bootstrap() {
  const authIds = [
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
    'cccccccc-cccc-cccc-cccc-cccccccccc03',
  ];
  psqlScript([
    `delete from public.meet_participants where profile_id in (select id from public.profiles where auth_user_id in ('${authIds.join("','")}') or id like 'u_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa%' or id like 'u_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb%' or id like 'u_cccccccccccccccccccccccccccccc%' or handle in ('p6f5_ca','p6f5_cb','p6f5_cc'));`,
    `delete from public.meet_queue where profile_id in (select id from public.profiles where auth_user_id in ('${authIds.join("','")}') or handle in ('p6f5_ca','p6f5_cb','p6f5_cc') or id like 'u_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa%' or id like 'u_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb%' or id like 'u_cccccccccccccccccccccccccccccc%');`,
    `delete from public.profiles where auth_user_id in ('${authIds.join("','")}') or id in ('u_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01','u_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb02','u_cccccccccccccccccccccccccccccc03') or handle in ('p6f5_ca','p6f5_cb','p6f5_cc');`,
    `delete from auth.users where id in ('${authIds.join("','")}');`,
    `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01','authenticated','authenticated','ca6f5@example.invalid',extensions.crypt('x', extensions.gen_salt('bf')), now(), '{}'::jsonb,'{}'::jsonb, now(), now()),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02','authenticated','authenticated','cb6f5@example.invalid',extensions.crypt('x', extensions.gen_salt('bf')), now(), '{}'::jsonb,'{}'::jsonb, now(), now()),
      ('cccccccc-cccc-cccc-cccc-cccccccccc03','authenticated','authenticated','cc6f5@example.invalid',extensions.crypt('x', extensions.gen_salt('bf')), now(), '{}'::jsonb,'{}'::jsonb, now(), now());`,
    "update public.profiles set handle='p6f5_ca', name='Cancel Conc A' where auth_user_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01';",
    "update public.profiles set handle='p6f5_cb', name='Cancel Conc B' where auth_user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02';",
    "update public.profiles set handle='p6f5_cc', name='Cancel Conc C' where auth_user_id='cccccccc-cccc-cccc-cccc-cccccccccc03';",
  ]);
}

async function caseCancelWinsBeforeMatch() {
  const a = profileId('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01');
  const b = profileId('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02');
  psqlScript([
    `delete from public.meet_participants where profile_id in ('${a}','${b}');`,
    `delete from public.meet_queue where profile_id in ('${a}','${b}');`,
    `insert into public.meet_queue (id, profile_id, mode, channel, status) values ('mq_6f5c_a1','${a}','ANYWHERE','TEXT','waiting');`,
    `insert into public.meet_queue (id, profile_id, mode, channel, status) values ('mq_6f5c_b1','${b}','ANYWHERE','TEXT','waiting');`,
  ]);

  const sessionsBefore = Number(psql('select count(*) from public.meet_sessions'));
  const holder = backgroundPsql(`
begin;
select id from public.meet_queue where id='mq_6f5c_a1' for update;
select pg_sleep(3);
${asUserSql('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01')}
select public.cancel_meet_search('mq_6f5c_a1');
commit;
`);
  await sleep(800); // holder has acquired FOR UPDATE
  const matcher = await backgroundPsql(`
begin;
select public.try_meet_match('mq_6f5c_a1');
commit;
`);
  const holderResult = await holder;
  const sessionsAfter = Number(psql('select count(*) from public.meet_sessions'));
  const aStatus = psql("select status::text from public.meet_queue where id='mq_6f5c_a1'");
  return {
    name: 'cancel_wins_before_match',
    holderCode: holderResult.code,
    matcherCode: matcher.code,
    holderStdout: holderResult.stdout,
    matcherStdout: matcher.stdout,
    aStatus,
    sessionsCreated: sessionsAfter - sessionsBefore,
    matchedFalse: /"matched"\s*:\s*false/.test(matcher.stdout),
    pass:
      holderResult.code === 0 &&
      matcher.code === 0 &&
      aStatus === 'cancelled' &&
      sessionsAfter === sessionsBefore &&
      /"matched"\s*:\s*false/.test(matcher.stdout) &&
      /cancelled_waiting/.test(holderResult.stdout),
  };
}

async function caseMatchWinsBeforeCancel() {
  const a = profileId('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01');
  const b = profileId('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02');
  psqlScript([
    `delete from public.meet_participants where profile_id in ('${a}','${b}');`,
    `delete from public.meet_queue where profile_id in ('${a}','${b}');`,
    `insert into public.meet_queue (id, profile_id, mode, channel, status) values ('mq_6f5c_a2','${a}','ANYWHERE','TEXT','waiting');`,
    `insert into public.meet_queue (id, profile_id, mode, channel, status) values ('mq_6f5c_b2','${b}','ANYWHERE','TEXT','waiting');`,
  ]);

  const matcher = backgroundPsql(`
begin;
select public.try_meet_match('mq_6f5c_a2');
select pg_sleep(3);
commit;
`);
  await sleep(800); // match committed its row updates inside the open transaction
  const cancel = await backgroundPsql(`
begin;
${asUserSql('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01')}
select public.cancel_meet_search('mq_6f5c_a2');
commit;
`);
  const matcherResult = await matcher;
  const aStatus = psql("select status::text from public.meet_queue where id='mq_6f5c_a2'");
  const ended = Number(
    psql(
      `select count(*)::text from public.meet_sessions s join public.meet_participants p on p.session_id=s.id where p.profile_id='${a}' and s.status='ended' and s.end_reason='cancel'`,
    ),
  );
  return {
    name: 'match_wins_before_cancel',
    matcherCode: matcherResult.code,
    cancelCode: cancel.code,
    matcherStdout: matcherResult.stdout,
    cancelStdout: cancel.stdout,
    aStatus,
    endedSessions: ended,
    pass:
      matcherResult.code === 0 &&
      cancel.code === 0 &&
      ended >= 1 &&
      aStatus === 'cancelled' &&
      /ended_session/.test(cancel.stdout) &&
      /"matched"\s*:\s*true/.test(matcherResult.stdout),
  };
}

async function caseLockTimeoutObservation() {
  const c = profileId('cccccccc-cccc-cccc-cccc-cccccccccc03');
  psqlScript([
    "delete from public.meet_queue where id='mq_6f5c_lock';",
    `insert into public.meet_queue (id, profile_id, mode, channel, status) values ('mq_6f5c_lock','${c}','ANYWHERE','TEXT','waiting');`,
  ]);

  const holder = backgroundPsql(`
begin;
select id from public.meet_queue where id='mq_6f5c_lock' for update;
select pg_sleep(3);
commit;
`);
  await sleep(800);
  const started = Date.now();
  const cancel = await backgroundPsql(`
begin;
set local lock_timeout = '8s';
${asUserSql('cccccccc-cccc-cccc-cccc-cccccccccc03')}
select public.cancel_meet_search('mq_6f5c_lock');
commit;
`);
  const holderResult = await holder;
  const waitedMs = Date.now() - started;
  const status = psql("select status::text from public.meet_queue where id='mq_6f5c_lock'");
  return {
    name: 'cancel_waits_for_row_lock_no_deadlock',
    holderCode: holderResult.code,
    cancelCode: cancel.code,
    waitedMs,
    status,
    cancelStdout: cancel.stdout,
    pass:
      holderResult.code === 0 &&
      cancel.code === 0 &&
      status === 'cancelled' &&
      waitedMs >= 2000 &&
      !/deadlock/i.test(cancel.stderr + holderResult.stderr) &&
      /cancelled_waiting/.test(cancel.stdout),
  };
}

async function main() {
  const identity = {
    container: CONTAINER,
    systemIdentifier: psql('select system_identifier from pg_control_system()'),
    port: '55522',
    projectId: 'clash-6f5-meet-cancel',
  };
  await bootstrap();
  const results = [];
  results.push(await caseCancelWinsBeforeMatch());
  results.push(await caseMatchWinsBeforeCancel());
  results.push(await caseLockTimeoutObservation());
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
