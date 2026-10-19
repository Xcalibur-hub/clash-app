/**
 * Step 5F: canonical Duel settlement integrity (real, committed fixtures).
 *
 * A pgTAP transaction cannot exercise settlement: settle_clash compares
 * closes_at against the transaction-start now(), so closing must happen in a
 * later transaction. This script therefore drives committed fixtures through
 * separate psql sessions, asserts the invariants, and cleans up.
 */
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const DB = ['exec', '-i', 'supabase_db_clash', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-f', '-'];
const psql = (sql) => spawnSync('docker', DB, { input: sql, encoding: 'utf8' });
const run = (sql) => psql(sql);
const mustRun = (sql, label) => {
  const result = run(sql);
  if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
  return `${result.stdout}`.trim();
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const FAN = 's7-fan';
const AUTHOR = 's7-author';
const CHALLENGER = 's7-challenger';
const JUROR = 's7-juror';

function createDuel({ clash, room, topic, closesInSeconds }) {
  const result = run(`
    begin;
    insert into public.takes (id, author_id, hood, text, status, expires_at)
    values ('${clash}-take','${AUTHOR}','techtakes','S5F settlement fixture','active', now()+interval '3 hours');
    insert into public.clashes (id, take_id, challenger_id, status, opens_at, closes_at, duel_key)
    values ('${clash}','${clash}-take','${CHALLENGER}','open', now()-interval '10 min', now()+interval '${closesInSeconds} seconds', gen_random_uuid());
    insert into public.arena_daily_topics (id,title,description,hood,status,opens_at,final_arguments_at,judging_at,closes_at)
    values ('${topic}','S5F fixture','local test','techtakes','live', now()-interval '10 min', now()-interval '5 min', now()-interval '2 min', now()+interval '${closesInSeconds} seconds');
    insert into public.arena_rooms (id, topic_id, clash_id, status, capacity, participant_count, opens_at, closes_at)
    values ('${room}','${topic}','${clash}','JUDGING',2,2, now()-interval '10 min', now()+interval '${closesInSeconds} seconds');
    insert into public.arena_room_participants (room_id, topic_id, profile_id, role, initial_stance)
    values ('${room}','${topic}','${AUTHOR}','debater','AGREE'), ('${room}','${topic}','${CHALLENGER}','debater','DISAGREE');
    insert into public.judgements (clash_id, juror_id, side) values ('${clash}','${JUROR}','A');
    insert into public.clash_follows (clash_id, follower_id) values ('${clash}','${FAN}');
    commit;
  `);
  if (result.status !== 0) throw new Error(`fixture ${clash} failed: ${result.stderr || result.stdout}`);
}

function setup() {
  mustRun(`
    insert into auth.users (id) values
      ('00000000-0000-0000-0000-0000000f7001'),
      ('00000000-0000-0000-0000-0000000f7002'),
      ('00000000-0000-0000-0000-0000000f7003'),
      ('00000000-0000-0000-0000-0000000f7004')
      on conflict (id) do nothing;
    update public.profiles set id='${AUTHOR}', handle='s7_author', name='S7 Author' where auth_user_id='00000000-0000-0000-0000-0000000f7001';
    update public.profiles set id='${CHALLENGER}', handle='s7_challenger', name='S7 Challenger' where auth_user_id='00000000-0000-0000-0000-0000000f7002';
    update public.profiles set id='${FAN}', handle='s7_fan', name='S7 Fan' where auth_user_id='00000000-0000-0000-0000-0000000f7003';
    update public.profiles set id='${JUROR}', handle='s7_juror', name='S7 Juror' where auth_user_id='00000000-0000-0000-0000-0000000f7004';
    insert into public.arena_rooms (id, topic_id, status, capacity, participant_count, opens_at, closes_at)
    select 's7-group-room','devfx_arena_topic_live','OPEN',20,1, now()-interval '10 min', now()+interval '1 hour'
     where not exists (select 1 from public.arena_rooms where id='s7-group-room');
    insert into public.arena_daily_topics (id,title,description,hood,status,opens_at,final_arguments_at,judging_at,closes_at)
    select 's7-group-topic','S7 group topic','local test','techtakes','live', now()-interval '10 min', now()+interval '10 min', now()+interval '20 min', now()+interval '1 hour'
     where not exists (select 1 from public.arena_daily_topics where id='s7-group-topic');
  `, 'setup');
}

function cleanup() {
  psql(`
    delete from public.clash_follows where clash_id like 's7-%';
    delete from public.clashes where id like 's7-%';
    delete from public.arena_rooms where id like 's7-%';
    delete from public.arena_daily_topics where id like 's7-%';
    delete from public.takes where id like 's7-%';
    delete from public.profiles where id like 's7-%';
    delete from auth.users where id::text like '00000000-0000-0000-0000-0000000f70%';
  `);
}
(async () => {
  try {
    setup();
    createDuel({ clash: 's7-clash', room: 's7-room', topic: 's7-topic', closesInSeconds: 3 });
    createDuel({ clash: 's7-early', room: 's7-early-room', topic: 's7-early-topic', closesInSeconds: 120 });
    await wait(5000);

    // 1. Canonical settlement after the permitted closing time.
    const settled = run(`select public.settle_clash('s7-clash');`);
    assert.equal(settled.status, 0, `settlement failed: ${settled.stderr}`);

    const state = mustRun(
      "select c.status::text||'|'||r.status::text||'|'||v.winner_side::text||'|'||v.jury_size::text from public.clashes c join public.arena_rooms r on r.clash_id=c.id join public.verdicts v on v.clash_id=c.id where c.id='s7-clash';",
      'state check',
    );
    assert.equal(state, 'settled|SETTLED|A|1', `unexpected settlement state: ${state}`);
    console.log('PASS clash settled with room SETTLED and authoritative verdict');

    // 2. Exactly one follower notification (plus one per debater).
    assert.equal(
      mustRun("select count(*) from public.notifications where entity_id='s7-clash' and kind='clash_result' and recipient_id='s7-fan';", 'follower notification'),
      '1',
    );
    assert.equal(
      mustRun("select count(*) from public.notifications where entity_id='s7-clash' and kind='clash_result';", 'all notifications'),
      '3',
    );
    console.log('PASS exactly-once follower delivery');

    // 3. Repeated settlement is idempotent.
    const again = run(`select public.settle_clash('s7-clash');`);
    assert.equal(again.status, 0, `repeat settlement failed: ${again.stderr}`);
    assert.equal(
      mustRun("select count(*) from public.notifications where entity_id='s7-clash' and kind='clash_result';", 'repeat notification'),
      '3',
    );
    assert.equal(
      mustRun("select winner_side::text from public.verdicts where clash_id='s7-clash';", 'verdict stability'),
      'A',
    );
    console.log('PASS repeated settlement is idempotent');

    // 4. Settlement before closing is refused and leaves no partial state.
    const early = run(`select public.settle_clash('s7-early');`);
    assert.notEqual(early.status, 0, 'pre-close settlement must fail');
    assert.match(`${early.stderr}`, /has not closed yet/);
    assert.equal(
      mustRun("select c.status::text||'|'||r.status::text||'|'||(select count(*) from public.verdicts where clash_id='s7-early') from public.clashes c join public.arena_rooms r on r.clash_id=c.id where c.id='s7-early';", 'rollback state'),
      'open|JUDGING|0',
    );
    console.log('PASS failed settlement rolls back cleanly');

    // 5. Unrelated group room is untouched.
    assert.equal(
      mustRun("select status::text from public.arena_rooms where id='s7-group-room';", 'group room'),
      'OPEN',
    );
    console.log('PASS group room lifecycle unchanged');

    // 6. Anonymous callers cannot execute settlement.
    const anon = run(`
      set role anon;
      select public.settle_clash('s7-clash');
    `);
    assert.notEqual(anon.status, 0, 'anon settlement must be refused');
    assert.match(`${anon.stderr}`, /permission denied/i);
    console.log('PASS anon cannot execute settlement');
  } finally {
    cleanup();
  }
})().catch((error) => {
  console.error('FAIL', error.message);
  process.exitCode = 1;
});

