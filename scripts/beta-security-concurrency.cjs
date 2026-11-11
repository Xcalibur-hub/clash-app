/* Explicitly authorized disposable PostgreSQL only; no provisioning or cleanup. */
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
const IMAGE = 'public.ecr.aws/supabase/postgres@sha256:06ddc7962e11ab0f4f0334fd05671e97c30ea202f6e6a7113800bd3d6e416108';
function validateTarget(t, actual, systemId) {
  assert.equal(t.container, 'clash-beta-security-20261111');
  assert.match(t.id, /^[a-f0-9]{64}$/); assert.equal(actual.Id, t.id);
  assert.equal(actual.Name, '/' + t.container); assert.equal(actual.Config.Image, IMAGE);
  assert.equal(actual.Config.Labels['clash.owner'], 'beta-security-20261111');
  assert.equal(actual.HostConfig.NetworkMode, 'none'); assert.equal(actual.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(actual.HostConfig.PortBindings ?? {}, {});
  assert.ok(actual.Mounts.every(m => m.Type === 'tmpfs')); assert.equal(actual.State.Running, true);
  assert.match(t.database, /^beta_security_v[1-9][0-9]*$/); assert.equal(systemId, t.systemId);
  assert.ok(!['7703813712308420644', '7701628855711424555'].includes(systemId));
}
async function main() {
  if (!process.argv.includes('--authorize-disposable-beta-security')) throw Error('Disposable beta security authorization required');
  const receipt = process.argv[process.argv.indexOf('--target-receipt') + 1];
  if (!process.argv.includes('--target-receipt') || !receipt) throw Error('Exact disposable receipt required');
  const t = JSON.parse(fs.readFileSync(receipt));
  if (t.container !== 'clash-beta-security-20261111' || !/^[a-f0-9]{64}$/.test(t.id)) throw Error('Forbidden target');
  const args = ['exec', '-i', '-e', 'PGHOST=/tmp', '-e', 'PGOPTIONS=-c statement_timeout=15000 -c lock_timeout=10000',
    t.id, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-U', 'postgres', '-d', t.database];
  const sql = input => cp.execFileSync('docker', args, { input, encoding: 'utf8', timeout: 20000 });
  const actual = JSON.parse(cp.execFileSync('docker', ['inspect', t.id], { encoding: 'utf8' }))[0];
  // Validate Docker before even opening a socket to the pinned database.
  validateTarget(t, actual, t.systemId);
  validateTarget(t, actual, sql('select system_identifier::text from pg_control_system();').trim());
  assert.equal(sql("select count(*) from public.takes where id like 'beta-race-%';").trim(), '0', 'fixture collision');
  sql(`insert into auth.users(id) values('00000000-0000-0000-0000-00000000bd01'),('00000000-0000-0000-0000-00000000bd02');
    update public.profiles set id='beta-race-a',handle='beta_race_a' where auth_user_id='00000000-0000-0000-0000-00000000bd01';
    update public.profiles set id='beta-race-b',handle='beta_race_b' where auth_user_id='00000000-0000-0000-0000-00000000bd02';
    insert into public.takes(id,author_id,hood,text) select 'beta-race-'||n,'beta-race-a','techtakes','Concurrent source identity' from generate_series(1,3)n;
    insert into public.explore_challenges(id,title,challenge_type,starts_at,ends_at,status) values('beta-race-play','Race fixture','GLOBAL',now()-interval '1 hour',now()+interval '1 day','active');
    insert into public.explore_challenge_participants(challenge_id,profile_id) values('beta-race-play','beta-race-a');`);
  const actor = n => `set local role authenticated;select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000bd0${n}","role":"authenticated"}',true);`;
  const children = new Set(), results = [];
  const save = () => fs.writeFileSync(receipt + '.concurrency.json', JSON.stringify(results, null, 2));
  function client(input) {
    const p = cp.spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    children.add(p); const c = { p, out: '', err: '', code: null };
    p.stdout.on('data', b => { c.out += b; }); p.stderr.on('data', b => { c.err += b; });
    c.done = new Promise((resolve, reject) => { p.on('error', reject); p.on('close', code => { c.code = code; children.delete(p); resolve(c); }); });
    p.stdin.write(input + '\n'); return c;
  }
  async function until(predicate) {
    const end = Date.now() + 7000;
    while (Date.now() < end) { if (predicate()) return; await new Promise(r => setTimeout(r, 60)); }
    throw Error('Bounded coordination timeout');
  }
  async function ready(c) { await until(() => /READY:\d+/.test(c.out)); return Number(c.out.match(/READY:(\d+)/)[1]); }
  async function blocked(name, holderPid) {
    let row;
    await until(() => { row = sql(`select pid||':'||pg_blocking_pids(pid)::text from pg_stat_activity where application_name='${name}' and ${holderPid}=any(pg_blocking_pids(pid));`).trim(); return Boolean(row); });
    return row;
  }
  const challenge = n => `select public.create_arena_challenge('beta-race-${n}','A genuine counter-position for concurrent authorization.');`;
  try {
    let h = client(`begin;${actor(2)}${challenge(1)}select 'READY:'||pg_backend_pid();`);
    let pid = await ready(h), w = client(`begin;set local application_name='beta_identity_wait';${actor(1)}update public.takes set text='Forbidden rewrite' where id='beta-race-1';commit;`);
    w.p.stdin.end(); let wait = await blocked('beta_identity_wait', pid); h.p.stdin.end('commit;\n');
    await Promise.all([h.done, w.done]); assert.equal(h.code, 0); assert.equal(w.code, 3); assert.match(w.err, /23514/);
    results.push({ case: 'challenge binds before concurrent edit', holderPid: pid, blocking: wait, denied: '23514' }); save();
    h = client(`begin;${actor(1)}update public.takes set text='Revised before binding' where id='beta-race-2';select 'READY:'||pg_backend_pid();`);
    pid = await ready(h); w = client(`begin;set local application_name='beta_challenge_wait';${actor(2)}${challenge(2)}commit;`);
    w.p.stdin.end(); wait = await blocked('beta_challenge_wait', pid); h.p.stdin.end('commit;\n');
    await Promise.all([h.done, w.done]); assert.equal(h.code, 0); assert.equal(w.code, 0);
    assert.equal(sql("select text from public.takes where id='beta-race-2';").trim(), 'Revised before binding');
    results.push({ case: 'edit before invitation remains legitimate', holderPid: pid, blocking: wait }); save();
    w = client(`begin isolation level repeatable read;${actor(1)}select text from public.takes where id='beta-race-3';select 'READY:'||pg_backend_pid();`);
    await ready(w); h = client(`begin;${actor(2)}${challenge(3)}select 'READY:'||pg_backend_pid();`); pid = await ready(h);
    w.p.stdin.write("set local application_name='beta_snapshot_wait';update public.takes set text='Stale snapshot rewrite' where id='beta-race-3';commit;\n"); w.p.stdin.end();
    wait = await blocked('beta_snapshot_wait', pid); h.p.stdin.end('commit;\n'); await Promise.all([h.done, w.done]);
    assert.equal(h.code, 0); assert.equal(w.code, 3); assert.match(w.err, /40001/);
    results.push({ case: 'old repeatable-read snapshot cannot miss binding', holderPid: pid, blocking: wait, denied: '40001' }); save();
    h = client("begin;select 1 from public.explore_challenges where id='beta-race-play' for update;select 'READY:'||pg_backend_pid();"); pid = await ready(h);
    w = client(`begin;set local application_name='beta_admission_wait';${actor(1)}select public.join_challenge('beta-race-play');commit;`); w.p.stdin.end();
    wait = await blocked('beta_admission_wait', pid);
    h.p.stdin.end("delete from public.explore_challenge_participants where challenge_id='beta-race-play' and profile_id='beta-race-a';commit;\n");
    await Promise.all([h.done, w.done]); assert.equal(h.code, 0); assert.equal(w.code, 3); assert.match(w.err, /42501/);
    assert.equal(sql("select count(*) from public.explore_challenge_participants where challenge_id='beta-race-play';").trim(), '0');
    results.push({ case: 'revocation during join wait cannot readmit', holderPid: pid, blocking: wait, denied: '42501' }); save();
    console.log(JSON.stringify({ status: 'PASS', scenarios: results.length, evidence: receipt + '.concurrency.json' }));
  } finally { for (const p of children) { p.stdin.end('rollback;\n'); } }
}
module.exports = { validateTarget };
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
