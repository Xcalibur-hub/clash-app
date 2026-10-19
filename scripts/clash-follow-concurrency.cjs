/**
 * Step 4E verification: genuine two-session follow/verdict ordering.
 *
 * Two independent psql processes (separate docker exec sessions) exercise the
 * FOR SHARE / FOR UPDATE interaction for real. Fixtures use a `cc-` prefix and
 * are removed afterwards; no existing data is touched.
 *
 * A) follow issued while settlement holds the row lock blocks, then observes
 *    `settled` and is refused; no relationship, no notification.
 * B) follow committed BEFORE verdict insertion is notified exactly once.
 * C) unfollow after settlement still works.
 */
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const DB = ['exec', '-i', 'supabase_db_clash', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-f', '-'];
const psql = (sql) => spawnSync('docker', DB, { input: sql, encoding: 'utf8' });
const mustRun = (sql, label) => {
  const result = psql(sql);
  if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
};

const FAN_USER = '00000000-0000-0000-0000-0000000cc0f1';
const AUTHOR_USER = '00000000-0000-0000-0000-0000000cc0a1';
const CHALLENGER_USER = '00000000-0000-0000-0000-0000000cc0b1';

function setup() {
  mustRun(`
    insert into auth.users (id) values ('${FAN_USER}'), ('${AUTHOR_USER}'), ('${CHALLENGER_USER}')
      on conflict (id) do nothing;
    update public.profiles set id='cc-fan', handle='cc_fan', name='CC Fan' where auth_user_id='${FAN_USER}';
    update public.profiles set id='cc-author', handle='cc_author', name='CC Author' where auth_user_id='${AUTHOR_USER}';
    update public.profiles set id='cc-challenger', handle='cc_challenger', name='CC Challenger' where auth_user_id='${CHALLENGER_USER}';
    insert into public.takes (id, author_id, hood, text) values ('cc-take','cc-author','techtakes','Concurrency proposition')
      on conflict (id) do nothing;
    insert into public.clashes (id, take_id, challenger_id, status, opens_at, closes_at) values
      ('cc-race','cc-take','cc-challenger','open', now() - interval '5 min', now() + interval '1 hour'),
      ('cc-early','cc-take','cc-challenger','open', now() - interval '5 min', now() + interval '1 hour')
      on conflict (id) do nothing;
  `, 'setup');
}

function cleanup() {
  psql(`
    delete from public.clashes where id like 'cc-%';
    delete from public.takes where id like 'cc-%';
    delete from public.profiles where id like 'cc-%';
    delete from auth.users where id in ('${FAN_USER}','${AUTHOR_USER}','${CHALLENGER_USER}');
  `);
}

/** Session A: hold the row lock, pause, then finalize the verdict. */
function settleSession(clashId) {
  const child = spawn('docker', DB, { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.stdin.end(`
    begin;
    select id from public.clashes where id='${clashId}' for update;
    select pg_sleep(3);
    insert into public.verdicts
      (clash_id, winner_side, side_a_score, side_b_score, jury_size, agreement, margin, verdict_label)
    values ('${clashId}','A',1,0,1,1,1,'CLEAR DECISION');
    update public.clashes set status='settled' where id='${clashId}';
    commit;
  `);
  return new Promise((resolve) => child.on('close', (code) => resolve({ code, out })));
}

const followSession = (clashId) => psql(`
  begin;
  select set_config('request.jwt.claims', json_build_object('sub','${FAN_USER}')::text, true);
  set local role authenticated;
  select public.follow_clash('${clashId}','cc-fan');
  commit;
`);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  try {
    setup();

    // A. Follow racing a settlement that already holds the row lock.
    const settling = settleSession('cc-race');
    await wait(800);
    const raced = followSession('cc-race');
    const settleResult = await settling;
    assert.equal(settleResult.code, 0, `settlement session failed: ${settleResult.out}`);

    const racedOut = `${raced.stdout}${raced.stderr}`;
    assert.notEqual(raced.status, 0, 'follow must fail after observing settled');
    assert.match(racedOut, /clash is unavailable/, 'uniform unavailable error');
    assert.equal(
      mustRun("select count(*) from public.clash_follows where clash_id='cc-race';", 'relationship check'),
      '0',
      'no relationship for the losing follow',
    );
    assert.equal(
      mustRun("select count(*) from public.notifications where entity_id='cc-race' and kind='clash_result';", 'notification check'),
      '0',
      'no notification for a follow that lost the race',
    );
    console.log('PASS raced follow refused after settlement');

    // B. Follow committed before the verdict insert is eligible.
    const early = followSession('cc-early');
    assert.equal(early.status, 0, `early follow failed: ${early.stderr}`);
    const earlySettle = await settleSession('cc-early');
    assert.equal(earlySettle.code, 0, `settlement session failed: ${earlySettle.out}`);
    assert.equal(
      mustRun("select count(*) from public.notifications where entity_id='cc-early' and recipient_id='cc-fan' and kind='clash_result';", 'early notification check'),
      '1',
      'a follow committed before verdict insertion receives exactly one notification',
    );
    console.log('PASS early follow notified exactly once');

    // C. Unfollow after settlement still works.
    const unfollow = psql(`
      begin;
      select set_config('request.jwt.claims', json_build_object('sub','${FAN_USER}')::text, true);
      set local role authenticated;
      select public.unfollow_clash('cc-early','cc-fan');
      commit;
    `);
    assert.equal(unfollow.status, 0, `post-settlement unfollow failed: ${unfollow.stderr}`);
    assert.equal(
      mustRun("select count(*) from public.clash_follows where clash_id='cc-early';", 'unfollow check'),
      '0',
      'settled Clash can still be unfollowed',
    );
    console.log('PASS post-settlement unfollow');
  } finally {
    cleanup();
  }
})().catch((error) => {
  console.error('FAIL', error.message);
  process.exitCode = 1;
});

